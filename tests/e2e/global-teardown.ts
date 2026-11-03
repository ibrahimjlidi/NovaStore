import { unlink } from 'node:fs/promises'
import { Pool } from 'pg'
import { readE2eContext } from './context.js'

export default async function globalTeardown() {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) return

  let context
  try {
    context = await readE2eContext()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  const pool = new Pool({ connectionString, max: 1 })
  try {
    await pool.query(
      'DELETE FROM stores WHERE id = $1 AND name = $2',
      [context.storeId, `E2E test ${context.storeId}`],
    )
  } finally {
    await pool.end()
  }
  await unlink('.playwright/e2e-context.json').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}
