import { randomUUID } from 'node:crypto'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import { applyMigrations } from '../../server/migration-runner.js'
import type { E2eContext } from './context.js'

async function recordSchemaOnlyMigrations(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  const history = await pool.query('SELECT COUNT(*)::int AS count FROM schema_migrations')
  if (history.rows[0].count > 0) return

  const columns = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema()`,
  )
  const available = new Set(columns.rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`))
  const required = [
    'stores.id', 'stores.name', 'stores.city',
    'store_users.id', 'store_users.store_id', 'store_users.email',
    'store_users.password_hash', 'store_users.auth_version', 'store_users.role',
    'invitations.token_hash', 'invitations.expires_at',
    'suppliers.id', 'products.id', 'products.archived_at',
    'product_variants.id', 'product_variants.color_hex',
    'purchase_orders.id', 'purchase_order_lines.id',
    'inventory_movements.id', 'inventory_movements.sale_item_id',
    'customers.id', 'sales.id', 'sale_items.id', 'sale_payments.id',
    'password_resets.token_hash',
  ]
  const missing = required.filter((column) => !available.has(column))
  if (missing.length) {
    throw new Error(`E2E_SCHEMA_ONLY is set, but the schema-only branch is missing required columns: ${missing.join(', ')}`)
  }

  const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url))
  const filenames = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()
  if (!filenames.length) throw new Error('No migration files were found for the schema-only E2E database.')
  const migrationBaseline = filenames.filter((filename) => {
    if (filename.startsWith('001_') || filename.startsWith('002_')) return true
    if (filename.startsWith('003_')) return available.has('store_users.disabled_at')
    if (filename.startsWith('004_')) return available.has('product_variants.low_stock_threshold')
    if (filename.startsWith('005_')) return available.has('sale_payments.id')
    return false
  })
  await pool.query(
    'INSERT INTO schema_migrations (filename) SELECT unnest($1::text[]) ON CONFLICT (filename) DO NOTHING',
    [migrationBaseline],
  )
}

export default async function globalSetup() {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) throw new Error('E2E_DATABASE_URL is required for end-to-end tests.')

  const pool = new Pool({ connectionString, max: 2 })
  const context: E2eContext = {
    storeId: randomUUID(),
    adminId: randomUUID(),
    adminEmail: `admin-${randomUUID()}@e2e.invalid`,
    adminPassword: randomUUID() + 'aA1!',
    storekeeperId: randomUUID(),
    storekeeperEmail: `storekeeper-${randomUUID()}@e2e.invalid`,
    storekeeperPassword: randomUUID() + 'aA1!',
    viewerId: randomUUID(),
    viewerEmail: `viewer-${randomUUID()}@e2e.invalid`,
    viewerPassword: randomUUID() + 'aA1!',
    productId: randomUUID(),
    variantId: randomUUID(),
    supplierId: randomUUID(),
  }

  try {
    if (process.env.E2E_SCHEMA_ONLY === 'true') await recordSchemaOnlyMigrations(pool)
    await applyMigrations(pool)
    await pool.query(
      'INSERT INTO stores (id, name, city) VALUES ($1, $2, $3)',
      [context.storeId, `E2E test ${context.storeId}`, 'Test city'],
    )
    const accounts = [
      { id: context.adminId, email: context.adminEmail, password: context.adminPassword, role: 'admin' },
      { id: context.storekeeperId, email: context.storekeeperEmail, password: context.storekeeperPassword, role: 'storekeeper' },
      { id: context.viewerId, email: context.viewerEmail, password: context.viewerPassword, role: 'viewer' },
    ] as const
    for (const account of accounts) {
      const passwordHash = await bcrypt.hash(account.password, 4)
      await pool.query(
        'INSERT INTO store_users (id, store_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
        [account.id, context.storeId, account.email, passwordHash, account.role],
      )
    }

    await pool.query(
      `INSERT INTO products (id, store_id, sku, name_ar, name_fr, category, price_tnd, low_stock_threshold)
       VALUES ($1, $2, 'E2E-BASE-001', 'منتج اختبار', 'Produit de test', 'tshirt', 25.500, 5)`,
      [context.productId, context.storeId],
    )
    await pool.query(
      `INSERT INTO product_variants (id, store_id, product_id, size, color_key, color_ar, color_fr, color_hex)
       VALUES ($1, $2, $3, 'M', 'noir', 'أسود', 'Noir', '#292D32')`,
      [context.variantId, context.storeId, context.productId],
    )
    await pool.query(
      `INSERT INTO inventory_movements (store_id, variant_id, type, quantity, note, created_by)
       VALUES ($1, $2, 'IN', 12, 'e2e-opening', $3)`,
      [context.storeId, context.variantId, context.adminId],
    )
    await pool.query(
      `INSERT INTO suppliers (id, store_id, name, phone, city, email, notes)
       VALUES ($1, $2, 'E2E Supplier', '+216 00 000 000', 'Test city', NULL, 'E2E fixture')`,
      [context.supplierId, context.storeId],
    )
    await mkdir('.playwright', { recursive: true })
    await writeFile('.playwright/e2e-context.json', JSON.stringify(context), { flag: 'w' })
  } catch (error) {
    try {
      await pool.query('DELETE FROM stores WHERE id = $1 AND name = $2', [context.storeId, `E2E test ${context.storeId}`])
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'E2E setup failed, and its partial test store could not be removed.')
    }
    throw error
  } finally {
    await pool.end()
  }
}
