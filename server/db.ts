import { Pool, type PoolClient } from 'pg'
import { HttpError } from './errors.js'

let pool: Pool | undefined

export function getPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new HttpError(503, 'DATABASE_URL is not configured.', 'configuration_error')
  }
  pool ??= new Pool({
    connectionString,
    max: process.env.VERCEL ? 4 : 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  })
  return pool
}

export async function inTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
