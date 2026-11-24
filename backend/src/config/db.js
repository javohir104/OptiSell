import pg from 'pg';
import { env } from './env.js';

const { Pool, types } = pg;

// Return BIGINT (COUNT(*), SUM of integers) as JS numbers.
// NUMERIC (money) stays a string to avoid floating-point precision loss.
types.setTypeParser(types.builtins.INT8, (v) => Number.parseInt(v, 10));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
});

pool.on('error', (err) => {
  // An idle client hit an error (e.g. DB restarted). Log it; the pool will replace the client.
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

/** Run a single parameterized query. */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run `fn(client)` inside a transaction.
 * Commits if fn resolves, rolls back if it throws, always releases the client.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabase() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}
