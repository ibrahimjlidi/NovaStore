import dotenv from 'dotenv'
import { getPool } from './db.js'
import { applyMigrations } from './migration-runner.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const pool = getPool(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)

try {
  await applyMigrations(pool)
  const { provisionBootstrapAdmin } = await import('./auth.js')
  await provisionBootstrapAdmin()
  console.log('Bootstrap administrator verified.')
} finally {
  await pool.end()
}
