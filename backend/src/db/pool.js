// backend/src/db/pool.js
import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

// --- helpers ---
function parseUrl(connectionString) {
  if (!connectionString) return undefined;
  try { return new URL(connectionString); } catch { return undefined; }
}

function normaliseCertificate(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.includes('-----BEGIN')
    ? trimmed.replace(/\\n/g, '\n')
    : Buffer.from(trimmed, 'base64').toString('utf8');
}

// Prefer IPv4 lookups for pg when DB_DISABLE_IPV6=true
function preferIPv4Lookup(hostname, options, callback) {
  if (!env.DB_DISABLE_IPV6) return dnsLookup(hostname, options, callback);
  let cb = callback, opts = options;
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  const ipv4Opts = { ...opts, family: 4 };
  return dnsLookup(hostname, ipv4Opts, (err, address, family) => {
    if (!err) return cb?.(null, address, family);
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return dnsLookup(hostname, opts, cb);
    }
    return cb?.(err, address, family);
  });
}

// --- build sanitized connection string ---
const rawUrl = env.DATABASE_URL;
const url = parseUrl(rawUrl);
if (!url) throw new Error('Invalid or missing DATABASE_URL');

// Strongly recommend: pooler URL + port 6543
// e.g. <project>.pooler.supabase.com:6543
const originalHost = url.host;
const originalHostname = url.hostname;

// Normalize query flags so libpq-like settings can't force strict verify
url.searchParams.set('sslmode', 'require');       // require TLS but don't enforce CA verification
url.searchParams.delete('ssl');                   // remove legacy ssl=true/false if present

// Do NOT rewrite host here; let pg resolve via lookup hook. Keep SNI servername as original hostname.
const sanitizedConnectionString = url.toString();

// --- TLS config ---
// Default (Supabase managed CA on Render): accept chain without providing CA.
// Keep SNI (servername) so the server presents the correct cert for the hostname.
const caCertificate = normaliseCertificate(env.DB_SSL_CA_CERT);
const hasCustomCA = !!caCertificate;
const sslServername = originalHostname;

let sslConfig = { rejectUnauthorized: false, servername: sslServername };
if (hasCustomCA) {
  sslConfig = { rejectUnauthorized: true, ca: caCertificate, servername: sslServername };
}

// Optional numeric host override is NOT applied; we prefer to let pg resolve via our lookup hook,
// because passing a numeric IP would break SNI if you forget servername.
// If you really need a hard override, set env.DB_IPV4_HOST and add { host: env.DB_IPV4_HOST } below.
const extraHostOption = (env.DB_IPV4_HOST && net.isIP(env.DB_IPV4_HOST) === 4)
  ? { host: env.DB_IPV4_HOST } : {};

// --- create pool ---
export const pool = new Pool({
  connectionString: sanitizedConnectionString,
  ...extraHostOption,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  lookup: preferIPv4Lookup,
});

// One-time diagnostics (no secrets)
(function logDbBootInfo() {
  try {
    const redacted = new URL(sanitizedConnectionString);
    if (redacted.password) redacted.password = '***';
    console.log('[DB] init', {
      host: redacted.host,                     // should be <project>.pooler.supabase.com:6543
      protocol: redacted.protocol,             // postgres:
      ssl: { rejectUnauthorized: sslConfig.rejectUnauthorized, servername: sslConfig.servername, ca: !!hasCustomCA },
      ipv6Disabled: !!env.DB_DISABLE_IPV6,
      ipv4HostOverride: extraHostOption.host || null,
      sslmode: redacted.searchParams.get('sslmode'),
    });
  } catch {}
})();

export const query = (text, params) => pool.query(text, params);
export async function assertDb() { await pool.query('select 1'); }
