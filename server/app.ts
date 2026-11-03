import { randomUUID } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import {
  acceptStoreInvitation,
  authHandler,
  authenticate,
  completePasswordReset,
  createPasswordResetLink,
  createStoreInvitation,
  getAllowedPages,
  requestPasswordReset,
  requireRole,
  type AuthenticatedRequest,
} from './auth.js'
import { getPool, inTransaction } from './db.js'
import { HttpError } from './errors.js'
import { previewProductCsv } from './import.js'
import { applyStockMovement } from './inventory.js'
import {
  inviteInput,
  movementInput,
  orderInput,
  parseInput,
  passwordResetCompleteInput,
  passwordResetRequestInput,
  productInput,
  roleInput,
  supplierInput,
} from './validation.js'

const app = express()
const api = express.Router()
const admin = requireRole('admin')
const inventoryUsers = requireRole('admin', 'storekeeper')
const reportReaders = requireRole('admin', 'viewer')

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}))
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60_000,
  limit: 25,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (request) => ['GET', 'HEAD', 'OPTIONS'].includes(request.method),
}), authHandler)

function requireSameOrigin(request: Request, _response: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next()
    return
  }
  const origin = request.get('origin')
  const configuredOrigin = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : `${request.protocol}://${request.get('host')}`
  if (!origin || origin !== configuredOrigin) {
    next(new HttpError(403, 'This request did not come from the application origin.', 'invalid_origin'))
    return
  }
  next()
}

app.use('/api', requireSameOrigin)
app.use('/api', express.json({ limit: '3mb' }))

api.get('/health', async (_request, response) => {
  await getPool().query('SELECT 1')
  response.json({ status: 'ok' })
})

const publicAuthLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

api.post('/public/invitations/accept', publicAuthLimit, async (request, response) => {
  const user = await acceptStoreInvitation(request.body)
  response.status(201).json({ id: user.id })
})

api.post('/public/password-reset/request', publicAuthLimit, async (request, response) => {
  const input = parseInput(passwordResetRequestInput, request.body)
  try {
    const emailEnabled = await requestPasswordReset(input.email)
    return response.status(202).json({
      message: emailEnabled
        ? 'If the account exists, password reset instructions will be sent.'
        : 'Password reset email is not configured. Contact your store administrator.',
      email_enabled: emailEnabled,
    })
  } catch (error) {
    if (!(error instanceof HttpError) || error.code !== 'email_delivery_failed') throw error
  }
  response.status(202).json({ message: 'If the account exists, password reset instructions will be sent.' })
})

api.post('/public/password-reset/complete', publicAuthLimit, async (request, response) => {
  const input = parseInput(passwordResetCompleteInput, request.body)
  await completePasswordReset(input.token, input.password)
  response.json({ message: 'Password updated.' })
})

api.use(authenticate)

api.get('/me', (request: AuthenticatedRequest, response) => {
  const user = request.user!
  response.json({
    id: user.id,
    email: user.email,
    role: user.role,
    store: { id: user.store_id, name: user.store_name, city: user.store_city, currency: 'TND' },
    allowed_pages: getAllowedPages(user.role),
  })
})

api.get('/dashboard', async (request: AuthenticatedRequest, response) => {
  const storeId = request.user!.store_id
  const [metrics, categoryValues, movementDays, lowProducts] = await Promise.all([
    getPool().query(
      `WITH variant_stock AS (
         SELECT v.product_id,
                SUM(CASE WHEN m.type = 'IN' THEN m.quantity
                         WHEN m.type = 'OUT' THEN -m.quantity
                         ELSE m.quantity * m.adjustment_sign END) AS quantity
         FROM product_variants v
         LEFT JOIN inventory_movements m ON m.variant_id = v.id AND m.store_id = v.store_id
         WHERE v.store_id = $1 GROUP BY v.id
       ), product_stock AS (
         SELECT p.id, p.low_stock_threshold, p.price_tnd, COALESCE(SUM(vs.quantity), 0) AS quantity
         FROM products p LEFT JOIN variant_stock vs ON vs.product_id = p.id
         WHERE p.store_id = $1 AND p.archived_at IS NULL
         GROUP BY p.id
       )
       SELECT COUNT(*)::int AS product_count,
              COALESCE(SUM(quantity), 0)::int AS unit_count,
              COALESCE(SUM(quantity * price_tnd), 0)::numeric(14,3) AS inventory_value,
              COUNT(*) FILTER (WHERE quantity <= low_stock_threshold)::int AS low_count,
              COUNT(*) FILTER (WHERE quantity = 0)::int AS out_count,
              (SELECT COUNT(*)::int FROM inventory_movements WHERE store_id = $1 AND created_at >= date_trunc('day', now())) AS today_movements
       FROM product_stock`,
      [storeId],
    ),
    getPool().query(
      `WITH stock AS (
         SELECT v.product_id, SUM(CASE WHEN m.type = 'IN' THEN m.quantity
           WHEN m.type = 'OUT' THEN -m.quantity ELSE m.quantity * m.adjustment_sign END) AS quantity
          FROM product_variants v LEFT JOIN inventory_movements m ON m.variant_id = v.id AND m.store_id = v.store_id
         WHERE v.store_id = $1 GROUP BY v.id
       )
       SELECT p.category, COALESCE(SUM(p.price_tnd * stock.quantity), 0)::numeric(14,3) AS value
       FROM products p LEFT JOIN stock ON stock.product_id = p.id
       WHERE p.store_id = $1 AND p.archived_at IS NULL GROUP BY p.category`,
      [storeId],
    ),
    getPool().query(
      `SELECT created_at::date AS day,
              SUM(CASE WHEN type = 'IN' THEN quantity WHEN type = 'ADJUSTMENT' AND adjustment_sign = 1 THEN quantity ELSE 0 END)::int AS incoming,
              SUM(CASE WHEN type = 'OUT' THEN quantity WHEN type = 'ADJUSTMENT' AND adjustment_sign = -1 THEN quantity ELSE 0 END)::int AS outgoing
       FROM inventory_movements
       WHERE store_id = $1 AND created_at >= current_date - interval '29 days'
       GROUP BY created_at::date ORDER BY day`,
      [storeId],
    ),
    getPool().query(
      `WITH stock AS (
         SELECT v.product_id, v.id AS variant_id, SUM(CASE WHEN m.type = 'IN' THEN m.quantity
           WHEN m.type = 'OUT' THEN -m.quantity ELSE m.quantity * m.adjustment_sign END) AS quantity
          FROM product_variants v LEFT JOIN inventory_movements m ON m.variant_id = v.id AND m.store_id = v.store_id
         WHERE v.store_id = $1 GROUP BY v.id
       )
       SELECT p.id, p.sku, p.name_ar, p.name_fr, p.category, p.price_tnd, p.low_stock_threshold,
              COALESCE(SUM(stock.quantity), 0)::int AS quantity,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', v.id, 'size', v.size, 'color_key', v.color_key,
                'color_ar', v.color_ar, 'color_fr', v.color_fr, 'color_hex', v.color_hex,
                'quantity', COALESCE(stock.quantity, 0)
              ) ORDER BY v.size, v.color_key) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
       FROM products p LEFT JOIN product_variants v ON v.product_id = p.id AND v.store_id = p.store_id
       LEFT JOIN stock ON stock.variant_id = v.id
       WHERE p.store_id = $1 AND p.archived_at IS NULL GROUP BY p.id
       HAVING COALESCE(SUM(stock.quantity), 0) <= p.low_stock_threshold
       ORDER BY quantity ASC LIMIT 8`,
      [storeId],
    ),
  ])
  response.json({
    metrics: metrics.rows[0],
    category_values: categoryValues.rows,
    movement_days: movementDays.rows,
    low_products: lowProducts.rows,
  })
})

api.get('/products', async (request: AuthenticatedRequest, response) => {
  const storeId = request.user!.store_id
  const query = typeof request.query.q === 'string' ? request.query.q.trim().slice(0, 100) : ''
  const category = typeof request.query.category === 'string' ? request.query.category : ''
  const lowOnly = request.query.low === 'true'
  const result = await getPool().query(
    `WITH variant_stock AS (
       SELECT v.id, SUM(CASE WHEN m.type = 'IN' THEN m.quantity
                             WHEN m.type = 'OUT' THEN -m.quantity
                             ELSE m.quantity * m.adjustment_sign END)::int AS quantity
       FROM product_variants v
       LEFT JOIN inventory_movements m ON m.variant_id = v.id AND m.store_id = v.store_id
       WHERE v.store_id = $1 GROUP BY v.id
     )
     SELECT p.id, p.sku, p.name_ar, p.name_fr, p.category, p.price_tnd,
            p.low_stock_threshold, p.created_at, p.updated_at,
            COALESCE(SUM(vs.quantity), 0)::int AS quantity,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', v.id, 'size', v.size, 'color_key', v.color_key,
              'color_ar', v.color_ar, 'color_fr', v.color_fr, 'color_hex', v.color_hex,
              'quantity', COALESCE(vs.quantity, 0)
            ) ORDER BY v.size, v.color_key) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
     FROM products p
     LEFT JOIN product_variants v ON v.product_id = p.id AND v.store_id = p.store_id
     LEFT JOIN variant_stock vs ON vs.id = v.id
     WHERE p.store_id = $1 AND p.archived_at IS NULL
       AND ($2 = '' OR p.sku ILIKE $3 OR p.name_ar ILIKE $3 OR p.name_fr ILIKE $3)
       AND ($4 = '' OR p.category = $4)
     GROUP BY p.id
     HAVING NOT $5 OR COALESCE(SUM(vs.quantity), 0) <= p.low_stock_threshold
     ORDER BY p.created_at DESC LIMIT 500`,
    [storeId, query, `%${query}%`, category, lowOnly],
  )
  response.json(result.rows)
})

api.post('/products', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(productInput, request.body)
  const product = await inTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO products (store_id, sku, name_ar, name_fr, category, price_tnd, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, sku, name_ar, name_fr, category, price_tnd, low_stock_threshold`,
      [request.user!.store_id, input.sku, input.name_ar, input.name_fr, input.category, input.price_tnd, input.low_stock_threshold],
    )
    for (const variant of input.variants) {
      await client.query(
        `INSERT INTO product_variants (store_id, product_id, size, color_key, color_ar, color_fr, color_hex)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [request.user!.store_id, inserted.rows[0].id, variant.size, variant.color_key, variant.color_ar, variant.color_fr, variant.color_hex],
      )
    }
    return { ...inserted.rows[0], variants: input.variants.map((variant) => ({ ...variant, quantity: 0 })) }
  })
  response.status(201).json(product)
})

api.put('/products/:id', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(productInput, request.body)
  const productId = String(request.params.id)
  const updated = await inTransaction(async (client) => {
    const product = await client.query(
      `UPDATE products SET sku = $3, name_ar = $4, name_fr = $5, category = $6,
       price_tnd = $7, low_stock_threshold = $8, updated_at = now()
       WHERE id = $1 AND store_id = $2 AND archived_at IS NULL
       RETURNING id, sku, name_ar, name_fr, category, price_tnd, low_stock_threshold`,
      [productId, request.user!.store_id, input.sku, input.name_ar, input.name_fr, input.category, input.price_tnd, input.low_stock_threshold],
    )
    if (!product.rowCount) throw new HttpError(404, 'Product not found.', 'not_found')
    const existing = await client.query(
      `SELECT v.id, v.size, v.color_key,
              EXISTS (SELECT 1 FROM inventory_movements m WHERE m.variant_id = v.id) AS has_history
       FROM product_variants v WHERE v.product_id = $1 AND v.store_id = $2 FOR UPDATE`,
      [productId, request.user!.store_id],
    )
    const nextKeys = new Set(input.variants.map((variant) => `${variant.size}:${variant.color_key.toLowerCase()}`))
    for (const variant of existing.rows) {
      if (nextKeys.has(`${variant.size}:${variant.color_key.toLowerCase()}`)) continue
      if (variant.has_history) {
        throw new HttpError(409, 'A variant with stock history cannot be removed. Keep it or archive the whole product.', 'variant_has_history')
      }
      await client.query('DELETE FROM product_variants WHERE id = $1 AND store_id = $2', [variant.id, request.user!.store_id])
    }
    for (const variant of input.variants) {
      await client.query(
        `INSERT INTO product_variants (store_id, product_id, size, color_key, color_ar, color_fr, color_hex)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (product_id, size, color_key)
         DO UPDATE SET color_ar = EXCLUDED.color_ar, color_fr = EXCLUDED.color_fr, color_hex = EXCLUDED.color_hex`,
        [request.user!.store_id, productId, variant.size, variant.color_key, variant.color_ar, variant.color_fr, variant.color_hex],
      )
    }
    return product.rows[0]
  })
  response.json(updated)
})

api.delete('/products/:id', admin, async (request: AuthenticatedRequest, response) => {
  const productId = String(request.params.id)
  const result = await getPool().query(
    `UPDATE products SET archived_at = now(), updated_at = now()
     WHERE id = $1 AND store_id = $2 AND archived_at IS NULL RETURNING id`,
    [productId, request.user!.store_id],
  )
  if (!result.rowCount) throw new HttpError(404, 'Product not found.', 'not_found')
  response.status(204).end()
})

api.get('/movements', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const days = Math.min(365, Math.max(1, Number(request.query.days) || 30))
  const result = await getPool().query(
    `SELECT m.id, m.type, m.quantity, m.adjustment_sign, m.note, m.created_at,
            p.id AS product_id, p.sku, p.name_ar, p.name_fr,
            v.id AS variant_id, v.size, v.color_ar, v.color_fr, v.color_hex,
            u.email AS created_by_email
     FROM inventory_movements m
     JOIN product_variants v ON v.id = m.variant_id
     JOIN products p ON p.id = v.product_id
     JOIN store_users u ON u.id = m.created_by
     WHERE m.store_id = $1 AND m.created_at >= now() - ($2::int * interval '1 day')
     ORDER BY m.created_at DESC LIMIT 1000`,
    [request.user!.store_id, days],
  )
  response.json(result.rows)
})

api.post('/movements', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(movementInput, request.body)
  const movement = await inTransaction(async (client) => {
    const variant = await client.query(
      `SELECT id FROM product_variants WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [input.variant_id, request.user!.store_id],
    )
    if (!variant.rowCount) throw new HttpError(404, 'Product variant not found.', 'not_found')
    const balance = await client.query<{ quantity: string }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity
          WHEN type = 'OUT' THEN -quantity ELSE quantity * adjustment_sign END), 0)::int AS quantity
       FROM inventory_movements WHERE variant_id = $1 AND store_id = $2`,
      [input.variant_id, request.user!.store_id],
    )
    applyStockMovement(Number(balance.rows[0].quantity), input)
    const sign = input.type === 'IN' ? 1 : input.type === 'OUT' ? -1 : input.adjustment_sign!
    const inserted = await client.query(
      `INSERT INTO inventory_movements
        (store_id, variant_id, type, quantity, adjustment_sign, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, type, quantity, adjustment_sign, note, created_at`,
      [request.user!.store_id, input.variant_id, input.type, input.quantity, input.type === 'ADJUSTMENT' ? sign : null, input.note, request.user!.id],
    )
    return inserted.rows[0]
  })
  response.status(201).json(movement)
})

api.get('/suppliers', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const result = await getPool().query(
    `SELECT s.id, s.name, s.phone, s.city, s.email, s.notes, s.created_at,
            COUNT(o.id)::int AS order_count
     FROM suppliers s LEFT JOIN purchase_orders o ON o.supplier_id = s.id AND o.store_id = s.store_id
     WHERE s.store_id = $1 GROUP BY s.id ORDER BY s.name`,
    [request.user!.store_id],
  )
  response.json(result.rows)
})

api.post('/suppliers', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(supplierInput, request.body)
  const result = await getPool().query(
    `INSERT INTO suppliers (store_id, name, phone, city, email, notes)
     VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6)
     RETURNING id, name, phone, city, email, notes, created_at`,
    [request.user!.store_id, input.name, input.phone, input.city, input.email, input.notes],
  )
  response.status(201).json(result.rows[0])
})

api.put('/suppliers/:id', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(supplierInput, request.body)
  const result = await getPool().query(
    `UPDATE suppliers SET name = $3, phone = $4, city = $5, email = NULLIF($6, ''), notes = $7
     WHERE id = $1 AND store_id = $2 RETURNING id, name, phone, city, email, notes, created_at`,
    [String(request.params.id), request.user!.store_id, input.name, input.phone, input.city, input.email, input.notes],
  )
  if (!result.rowCount) throw new HttpError(404, 'Supplier not found.', 'not_found')
  response.json(result.rows[0])
})

api.get('/purchase-orders', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const result = await getPool().query(
    `SELECT o.id, o.order_number, o.status, o.created_at, o.sent_at, o.received_at,
            s.id AS supplier_id, s.name AS supplier_name,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', line.id, 'variant_id', v.id, 'sku', p.sku,
              'name_ar', p.name_ar, 'name_fr', p.name_fr,
              'size', v.size, 'color_ar', v.color_ar, 'color_fr', v.color_fr,
              'quantity', line.quantity, 'unit_cost_tnd', line.unit_cost_tnd
            ) ORDER BY line.id) FILTER (WHERE line.id IS NOT NULL), '[]'::jsonb) AS lines,
            COALESCE(SUM(line.quantity * line.unit_cost_tnd), 0)::numeric(14,3) AS total_tnd
     FROM purchase_orders o
     JOIN suppliers s ON s.id = o.supplier_id
     LEFT JOIN purchase_order_lines line ON line.order_id = o.id
     LEFT JOIN product_variants v ON v.id = line.variant_id
     LEFT JOIN products p ON p.id = v.product_id
     WHERE o.store_id = $1 GROUP BY o.id, s.id ORDER BY o.created_at DESC LIMIT 500`,
    [request.user!.store_id],
  )
  response.json(result.rows)
})

api.post('/purchase-orders', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(orderInput, request.body)
  const order = await inTransaction(async (client) => {
    const supplier = await client.query('SELECT id FROM suppliers WHERE id = $1 AND store_id = $2', [input.supplier_id, request.user!.store_id])
    if (!supplier.rowCount) throw new HttpError(400, 'Choose a supplier from this store.', 'invalid_supplier')
    const inserted = await client.query(
      `INSERT INTO purchase_orders (store_id, supplier_id, created_by)
       VALUES ($1, $2, $3) RETURNING id, order_number, status, created_at`,
      [request.user!.store_id, input.supplier_id, request.user!.id],
    )
    for (const line of input.lines) {
      const variant = await client.query('SELECT id FROM product_variants WHERE id = $1 AND store_id = $2', [line.variant_id, request.user!.store_id])
      if (!variant.rowCount) throw new HttpError(400, 'A purchase line refers to a product outside this store.', 'invalid_variant')
      await client.query(
        `INSERT INTO purchase_order_lines (store_id, order_id, variant_id, quantity, unit_cost_tnd)
         VALUES ($1, $2, $3, $4, $5)`,
        [request.user!.store_id, inserted.rows[0].id, line.variant_id, line.quantity, line.unit_cost_tnd],
      )
    }
    return inserted.rows[0]
  })
  response.status(201).json(order)
})

api.patch('/purchase-orders/:id/status', inventoryUsers, async (request: AuthenticatedRequest, response) => {
  const status = request.body?.status
  if (status !== 'sent' && status !== 'received') throw new HttpError(400, 'Status must be sent or received.', 'validation_error')
  const order = await inTransaction(async (client) => {
    const selected = await client.query(
      `SELECT id, status FROM purchase_orders WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [String(request.params.id), request.user!.store_id],
    )
    const current = selected.rows[0]
    if (!current) throw new HttpError(404, 'Purchase order not found.', 'not_found')
    if (status === 'sent' && current.status !== 'draft') throw new HttpError(409, 'Only draft orders can be sent.', 'invalid_transition')
    if (status === 'received' && current.status !== 'sent') throw new HttpError(409, 'Send the order before receiving it.', 'invalid_transition')

    if (status === 'received') {
      const lines = await client.query(
        `SELECT id, variant_id, quantity FROM purchase_order_lines WHERE order_id = $1 AND store_id = $2`,
        [current.id, request.user!.store_id],
      )
      for (const line of lines.rows) {
        await client.query('SELECT id FROM product_variants WHERE id = $1 AND store_id = $2 FOR UPDATE', [line.variant_id, request.user!.store_id])
        await client.query(
          `INSERT INTO inventory_movements
           (store_id, variant_id, type, quantity, note, purchase_order_line_id, created_by)
           VALUES ($1, $2, 'IN', $3, 'purchase-order', $4, $5)`,
          [request.user!.store_id, line.variant_id, line.quantity, line.id, request.user!.id],
        )
      }
    }
    const updated = await client.query(
      `UPDATE purchase_orders SET status = $3,
         sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE sent_at END,
         received_at = CASE WHEN $3 = 'received' THEN now() ELSE received_at END
       WHERE id = $1 AND store_id = $2
       RETURNING id, order_number, status, created_at, sent_at, received_at`,
      [current.id, request.user!.store_id, status],
    )
    return updated.rows[0]
  })
  response.json(order)
})

api.get('/alerts', async (request: AuthenticatedRequest, response) => {
  const result = await getPool().query(
    `WITH stock AS (
      SELECT v.product_id, v.id AS variant_id, SUM(CASE WHEN m.type = 'IN' THEN m.quantity
         WHEN m.type = 'OUT' THEN -m.quantity ELSE m.quantity * m.adjustment_sign END)::int AS quantity
      FROM product_variants v LEFT JOIN inventory_movements m ON m.variant_id = v.id AND m.store_id = v.store_id
       WHERE v.store_id = $1 GROUP BY v.id
     )
     SELECT p.id, p.sku, p.name_ar, p.name_fr, p.category, p.price_tnd, p.low_stock_threshold,
            COALESCE(SUM(stock.quantity), 0)::int AS quantity,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', v.id, 'size', v.size, 'color_key', v.color_key,
              'color_ar', v.color_ar, 'color_fr', v.color_fr, 'color_hex', v.color_hex,
              'quantity', COALESCE(stock.quantity, 0)
            ) ORDER BY v.size, v.color_key) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
     FROM products p LEFT JOIN product_variants v ON v.product_id = p.id AND v.store_id = p.store_id
     LEFT JOIN stock ON stock.variant_id = v.id
     WHERE p.store_id = $1 AND p.archived_at IS NULL
     GROUP BY p.id HAVING COALESCE(SUM(stock.quantity), 0) <= p.low_stock_threshold
     ORDER BY quantity ASC`,
    [request.user!.store_id],
  )
  response.json(result.rows)
})

api.get('/reports/inventory', reportReaders, async (request: AuthenticatedRequest, response) => {
  const storeId = request.user!.store_id
  const days = Math.min(365, Math.max(1, Number(request.query.days) || 30))
  const [products, totals, movements] = await Promise.all([
    getPool().query(
      `WITH stock AS (
         SELECT v.product_id, v.id AS variant_id,
           SUM(CASE WHEN m.type = 'IN' THEN m.quantity WHEN m.type = 'OUT' THEN -m.quantity
             ELSE m.quantity * m.adjustment_sign END)::int AS quantity
         FROM product_variants v LEFT JOIN inventory_movements m ON m.variant_id = v.id
         WHERE v.store_id = $1 GROUP BY v.id
       )
       SELECT p.id, p.sku, p.name_ar, p.name_fr, p.category, p.price_tnd,
              COALESCE(SUM(stock.quantity), 0)::int AS quantity,
              (COALESCE(SUM(stock.quantity), 0) * p.price_tnd)::numeric(14,3) AS value_tnd
       FROM products p LEFT JOIN stock ON stock.product_id = p.id
       WHERE p.store_id = $1 AND p.archived_at IS NULL GROUP BY p.id ORDER BY value_tnd DESC`,
      [storeId],
    ),
    getPool().query(
      `SELECT COUNT(DISTINCT p.id)::int AS product_count,
              COALESCE(SUM(stock.quantity), 0)::int AS unit_count,
              COALESCE(SUM(stock.quantity * p.price_tnd), 0)::numeric(14,3) AS inventory_value
       FROM products p LEFT JOIN (
         SELECT v.product_id, SUM(CASE WHEN m.type = 'IN' THEN m.quantity WHEN m.type = 'OUT' THEN -m.quantity
           ELSE m.quantity * m.adjustment_sign END)::int AS quantity
         FROM product_variants v LEFT JOIN inventory_movements m ON m.variant_id = v.id
         WHERE v.store_id = $1 GROUP BY v.id
       ) stock ON stock.product_id = p.id
       WHERE p.store_id = $1 AND p.archived_at IS NULL`,
      [storeId],
    ),
    getPool().query(
      `SELECT created_at::date AS day,
              SUM(CASE WHEN type = 'IN' THEN quantity WHEN type = 'ADJUSTMENT' AND adjustment_sign = 1 THEN quantity ELSE 0 END)::int AS incoming,
              SUM(CASE WHEN type = 'OUT' THEN quantity WHEN type = 'ADJUSTMENT' AND adjustment_sign = -1 THEN quantity ELSE 0 END)::int AS outgoing
       FROM inventory_movements WHERE store_id = $1 AND created_at >= now() - ($2::int * interval '1 day')
       GROUP BY created_at::date ORDER BY day`,
      [storeId, days],
    ),
  ])
  response.json({ totals: totals.rows[0], products: products.rows, movement_days: movements.rows })
})

api.get('/team', admin, async (request: AuthenticatedRequest, response) => {
  const result = await getPool().query(
    `SELECT id, email, role, created_at FROM store_users WHERE store_id = $1 ORDER BY created_at`,
    [request.user!.store_id],
  )
  const invitations = await getPool().query(
    `SELECT id, email, role, status, created_at FROM invitations
     WHERE store_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY created_at DESC`,
    [request.user!.store_id],
  )
  response.json({ users: result.rows, invitations: invitations.rows })
})

api.post('/team/invitations', admin, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(inviteInput, request.body)
  const result = await createStoreInvitation(input.email, input.role, request.user!.store_id, request.user!.id)
  response.status(201).json(result)
})

api.post('/team/:id/password-reset', admin, async (request: AuthenticatedRequest, response) => {
  const result = await createPasswordResetLink(String(request.params.id), request.user!.store_id)
  response.json(result)
})

api.patch('/team/:id/role', admin, async (request: AuthenticatedRequest, response) => {
  const input = parseInput(roleInput, request.body)
  const userId = String(request.params.id)
  if (userId === request.user!.id) throw new HttpError(409, 'You cannot change your own role.', 'self_role_change')
  const result = await getPool().query(
    `UPDATE store_users SET role = $3 WHERE id = $1 AND store_id = $2
     RETURNING id, email, role, created_at`,
    [userId, request.user!.store_id, input.role],
  )
  if (!result.rowCount) throw new HttpError(404, 'Team member not found.', 'not_found')
  response.json(result.rows[0])
})

api.post('/import/preview', inventoryUsers, (request: AuthenticatedRequest, response) => {
  if (typeof request.body?.csv !== 'string') throw new HttpError(400, 'Send the CSV text in the csv field.', 'validation_error')
  const result = previewProductCsv(request.body.csv)
  if (!result.issues.length && result.rows.length) {
    response.json(result)
    return
  }
  response.status(result.issues.length ? 422 : 400).json(result)
})

api.post('/import/commit', admin, async (request: AuthenticatedRequest, response) => {
  if (typeof request.body?.csv !== 'string') throw new HttpError(400, 'Send the CSV text in the csv field.', 'validation_error')
  const preview = previewProductCsv(request.body.csv)
  if (preview.issues.length || !preview.rows.length) {
    throw new HttpError(422, 'Resolve the CSV preview errors before importing.', 'import_validation_error')
  }
  const storeId = request.user!.store_id
  const result = await inTransaction(async (client) => {
    const existing = await client.query(
      `SELECT sku FROM products WHERE store_id = $1 AND sku = ANY($2::text[])`,
      [storeId, [...new Set(preview.rows.map((row) => row.sku))]],
    )
    if (existing.rowCount) {
      throw new HttpError(409, `These SKUs already exist: ${existing.rows.map((row) => row.sku).join(', ')}.`, 'duplicate_sku')
    }
    const bySku = new Map<string, typeof preview.rows>()
    for (const row of preview.rows) bySku.set(row.sku, [...(bySku.get(row.sku) ?? []), row])
    let openingMovements = 0
    for (const [sku, rows] of bySku) {
      const first = rows[0]
      const product = await client.query(
        `INSERT INTO products (store_id, sku, name_ar, name_fr, category, price_tnd, low_stock_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [storeId, sku, first.name_ar, first.name_fr, first.category, first.price_tnd, first.low_stock_threshold],
      )
      for (const row of rows) {
        const variant = await client.query(
          `INSERT INTO product_variants (store_id, product_id, size, color_key, color_ar, color_fr, color_hex)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [storeId, product.rows[0].id, row.size, row.color_key, row.color_ar, row.color_fr, row.color_hex.toUpperCase()],
        )
        if (row.opening_quantity > 0) {
          await client.query(
            `INSERT INTO inventory_movements (store_id, variant_id, type, quantity, note, created_by)
             VALUES ($1, $2, 'IN', $3, 'opening-import', $4)`,
            [storeId, variant.rows[0].id, row.opening_quantity, request.user!.id],
          )
          openingMovements += 1
        }
      }
    }
    return { product_count: bySku.size, variant_count: preview.rows.length, opening_movement_count: openingMovements }
  })
  response.status(201).json(result)
})

app.use('/api', api)
app.use('/api', (_request, _response, next) => next(new HttpError(404, 'API route not found.', 'not_found')))
app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
  const requestId = randomUUID()
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message, code: error.code, request_id: requestId })
    return
  }
  const databaseError = error as { code?: string; constraint?: string }
  const requestError = error as { status?: number }
  if (requestError.status === 413) {
    response.status(413).json({ error: 'Request body exceeds the allowed size.', code: 'payload_too_large', request_id: requestId })
    return
  }
  if (requestError.status === 400) {
    response.status(400).json({ error: 'Request body is not valid JSON.', code: 'invalid_json', request_id: requestId })
    return
  }
  if (databaseError.code === '23505') {
    response.status(409).json({ error: 'A record with the same unique value already exists.', code: 'duplicate_record', request_id: requestId })
    return
  }
  if (databaseError.code === '23503' || databaseError.code === '23514') {
    response.status(400).json({ error: 'The request conflicts with inventory data constraints.', code: 'invalid_reference', request_id: requestId })
    return
  }
  console.error(JSON.stringify({ event: 'api_error', request_id: requestId, path: request.path, message: error instanceof Error ? error.message : 'Unknown error' }))
  response.status(500).json({ error: 'The server could not complete this request.', code: 'internal_error', request_id: requestId })
})

export default app
