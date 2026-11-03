import { join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'

export async function applyMigrations(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url))
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()
  for (const filename of files) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename])
    if (alreadyApplied.rowCount) {
      console.log(`Already applied: ${filename}`)
      continue
    }
    const sql = await readFile(join(migrationsDirectory, filename), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename])
      await client.query('COMMIT')
      console.log(`Applied: ${filename}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
