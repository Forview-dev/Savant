import dns from 'node:dns/promises';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

async function resolveDatabaseConnectionString(rawConnectionString) {
  if (!rawConnectionString) {
    throw new Error('DATABASE_URL is required');
  }

  let parsed;
  try {
    parsed = new URL(rawConnectionString);
  } catch (error) {
    console.warn('Invalid DATABASE_URL, using raw value');
    return rawConnectionString;
  }

  const { hostname } = parsed;

  if (!hostname || net.isIP(hostname)) {
    return rawConnectionString;
  }

  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    if (address) {
      parsed.hostname = address;
      return parsed.toString();
    }
  } catch (error) {
    console.warn(
      'Failed to resolve IPv4 address for database host; falling back to hostname',
      error instanceof Error ? error.message : error,
    );
  }

  return rawConnectionString;
}

const connectionString = await resolveDatabaseConnectionString(env.DATABASE_URL);

export const pool = new Pool({
  connectionString,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  lookup: preferIPv4Lookup,
});
