// Simple PG pool for Supabase Postgres (or any Postgres)
// Requires: process.env.DATABASE_URL
import pg from 'pg';

const { Pool } = pg;

// In Supabase, SSL is required in most environments.
// If you already configure SSL elsewhere, adjust here.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL_DISABLED === 'true' ? false : { rejectUnauthorized: false },
});

// Optional: small helper
export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
