// backend/src/db/pool.js
import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

/* -----------------------------------------------------------
   Utility helpers
------------------------------------------------------------ */

function parseUrl(connectionString) {
  if (!connectionString) return undefined;
  try {
    return new URL(connectionString);
  } catch {
    return undefined;
  }
}

/** Accept either a PEM block or a base64-encoded PEM */
function normaliseCertificate(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.includes('-----BEGIN')
    ? trimmed.replace(/\\n/g, '\n')
    : Buffer.from(trimmed, 'base64').toString('utf8');
}

/** Prefer IPv4 lookups for pg when DB_DISABLE_IPV6=true */
function preferIPv4Lookup(hostname, options, callback) {
  if (!env.DB_DISABLE_IPV6) return dnsLookup(hostname, options, callback);

  let cb = callback;
  let opts = options;
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  const ipv4Opts = { ...opts, family: 4 };

  return dnsLookup(hostname, ipv4Opts, (err, address, family) => {
    if (!err) return cb?.(null, address, family);

    // fallback to default resolver if IPv4 missing
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return dnsLookup(hostname, opts, cb);
    }

    return cb?.(err, address, family);
  });
}

/* -----------------------------------------------------------
   Build sanitized connection + TLS options
------------------------------------------------------------ */

const rawUrl = env.DATABASE_URL;
const url = parseUrl(rawUrl);
if (!url) throw new Error('Invalid or missing DATABASE_URL');

// Ensure we’re using Supabase *transaction* pooler port (6543)
url.port = url.port || '6543';
url.searchParams.set('sslmode', 'require');
url.searchParams.delete('ssl'); // remove legacy flag if present

const originalHostname = url.hostname;
const sanitizedConnectionString = url.toString();

// TLS configuration
const caCertificate = normaliseCertificate(env.DB_SSL_CA_CERT);
const hasCustomCA = !!caCertificate;
const sslServername = originalHostname;

// Default (Supabase managed CA on Render):
// keep encryption, skip CA/hostname verification entirely
let sslConfig = {
  rejectUnauthorized: false,
  servername: sslServername,
  // Bypass Node/OpenSSL hostname/chain verification completely.
  // Connection is still encrypted.
  checkServerIdentity: () => null,
};

// If a valid CA is provided, switch to strict verification
if (hasCustomCA) {
  sslConfig = {
    rejectUnauthorized: true,
    ca: caCertificate,
    servername: sslServername,
  };
}

// Optional manual IPv4 host override (rarely needed)
const extraHostOption =
  env.DB_IPV4_HOST && net.isIP(env.DB_IPV4_HOST) === 4
    ? { host: env.DB_IPV4_HOST }
    : {};

/* -----------------------------------------------------------
   Create Pool
------------------------------------------------------------ */

export const pool = new Pool({
  connectionString: sanitizedConnectionString,
  ...extraHostOption,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  lookup: preferIPv4Lookup,
});

/* -----------------------------------------------------------
   Diagnostics & helpers
------------------------------------------------------------ */

(function logDbBootInfo() {
  try {
    const redacted = new URL(sanitizedConnectionString);
    if (redacted.password) redacted.password = '***';
    console.log('[DB] init', {
      host: redacted.host, // should be *.pooler.supabase.com:6543
      protocol: redacted.protocol,
      ssl: {
        rejectUnauthorized: sslConfig.rejectUnauthorized,
        servername: sslConfig.servername,
        ca: hasCustomCA,
      },
      ipv6Disabled: !!env.DB_DISABLE_IPV6,
      ipv4HostOverride: extraHostOption.host || null,
      sslmode: redacted.searchParams.get('sslmode'),
    });
  } catch {}
})();

export const query = (text, params) => pool.query(text, params);
export async function assertDb() {
  await pool.query('select 1');
}
