// backend/src/db/pool.js
import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

function parseUrl(connectionString) {
  if (!connectionString) return undefined;
  try { return new URL(connectionString); }
  catch { return undefined; }
}

// Prefer IPv4 lookups for pg when DB_DISABLE_IPV6=true
function preferIPv4Lookup(hostname, options, callback) {
  if (!env.DB_DISABLE_IPV6) return dnsLookup(hostname, options, callback);

  let cb = callback, opts = options;
  if (typeof opts === 'function') { cb = opts; opts = {}; }

  const ipv4Opts = { ...opts, family: 4 };
  return dnsLookup(hostname, ipv4Opts, (err, address, family) => {
    if (!err) return cb?.(null, address, family);
    // Fallback if no A record
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return dnsLookup(hostname, opts, cb);
    }
    return cb?.(err, address, family);
  });
}

const parsed = parseUrl(env.DATABASE_URL);
if (!parsed) throw new Error('Invalid or missing DATABASE_URL');

const originalHostname = parsed.hostname;
// If we later force IPv4 by giving pg a numeric host, we still keep SNI using the original hostname.
const sslServername = originalHostname;

// Simple, Supabase-on-Render-safe TLS: accept managed CA; keep SNI servername.
const sslConfig = { rejectUnauthorized: false, servername: sslServername };

// Optional: numeric IPv4 override if IPv6 is disabled and the hostname is not already an IPv4 literal
let hostOverride = undefined;
if (env.DB_DISABLE_IPV6 && originalHostname && net.isIP(originalHostname) !== 4) {
  // Leave DNS resolution to pg's lookup hook; we don't hard-resolve here to keep it simple and robust.
  hostOverride = undefined;
}

// ---- Create the pool ----
export const pool = new Pool({
  connectionString: env.DATABASE_URL,    // MUST be the pooler URL with sslmode=require
  ...(hostOverride ? { host: hostOverride } : {}),
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  lookup: preferIPv4Lookup,
});

// Tiny one-time diagnostics to confirm what we actually used
(function logDbBootInfo() {
  try {
    // Avoid logging secrets
    const redacted = new URL(env.DATABASE_URL);
    if (redacted.password) redacted.password = '***';
    console.log('[DB] init', {
      host: redacted.host,
      protocol: redacted.protocol,
      ssl: { rejectUnauthorized: sslConfig.rejectUnauthorized, servername: sslConfig.servername },
      ipv6Disabled: !!env.DB_DISABLE_IPV6,
    });
  } catch { /* noop */ }
})();

export const query = (text, params) => pool.query(text, params);
export async function assertDb() { await pool.query('select 1'); }
