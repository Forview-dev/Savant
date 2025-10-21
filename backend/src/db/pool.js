import { Pool } from 'pg';
import { env } from '../config/env.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
});
