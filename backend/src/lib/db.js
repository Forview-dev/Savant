import { pool } from '../db/pool.js';

export { pool };

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}
