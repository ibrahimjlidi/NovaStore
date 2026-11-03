import bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import type { E2eContext } from './context.js'

export async function resetStore(context: E2eContext) {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) throw new Error('E2E_DATABASE_URL is required to reset test data.')

  const pool = new Pool({ connectionString, max: 1 })
  try {
    await pool.query('DELETE FROM inventory_movements WHERE store_id = $1', [context.storeId])
    await pool.query('DELETE FROM purchase_orders WHERE store_id = $1', [context.storeId])
    await pool.query('DELETE FROM purchase_order_lines WHERE store_id = $1', [context.storeId])
    await pool.query('DELETE FROM product_variants WHERE store_id = $1 AND product_id <> $2', [context.storeId, context.productId])
    await pool.query('DELETE FROM products WHERE store_id = $1 AND id <> $2', [context.storeId, context.productId])
    await pool.query('DELETE FROM suppliers WHERE store_id = $1 AND id <> $2', [context.storeId, context.supplierId])
    await pool.query('DELETE FROM invitations WHERE store_id = $1', [context.storeId])
    await pool.query('DELETE FROM password_resets WHERE store_id = $1', [context.storeId])
    await pool.query(
      'DELETE FROM store_users WHERE store_id = $1 AND id NOT IN ($2, $3, $4)',
      [context.storeId, context.adminId, context.storekeeperId, context.viewerId],
    )
    await pool.query(
      `UPDATE store_users
       SET role = CASE id WHEN $2 THEN 'admin' WHEN $3 THEN 'storekeeper' ELSE 'viewer' END
       WHERE store_id = $1`,
      [context.storeId, context.adminId, context.storekeeperId],
    )
    for (const account of [
      { id: context.adminId, password: context.adminPassword },
      { id: context.storekeeperId, password: context.storekeeperPassword },
      { id: context.viewerId, password: context.viewerPassword },
    ]) {
      await pool.query(
        'UPDATE store_users SET password_hash = $3 WHERE id = $1 AND store_id = $2',
        [account.id, context.storeId, await bcrypt.hash(account.password, 4)],
      )
    }
    await pool.query(
      `INSERT INTO inventory_movements (store_id, variant_id, type, quantity, note, created_by)
       VALUES ($1, $2, 'IN', 12, 'e2e-opening', $3)`,
      [context.storeId, context.variantId, context.adminId],
    )
  } finally {
    await pool.end()
  }
}
