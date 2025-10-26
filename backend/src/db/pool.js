// backend/src/db/pool.js
import dns from 'node:dns/promises';
import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

/**
 * Parse a DATABASE_URL safely.
 */
function parseUrl(connectionString) {
  if (!connectionString) return undefined;
  try {
    return new URL(connectionString);
  } catch (err) {
    console.warn('Failed to parse DATABASE_URL:', err?.message || err);
    return undefined;
  }
}

/**
 * Accept either a PEM block or a base64-encoded PEM.
 */
function normaliseCertificate(value) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const material = trimmed.includes('-----BEGIN')
    ? trimmed.replace(/\\n/g, '\n')
    : Buffer.from(trimmed, 'base64').toString('utf8');

  return material;
}

/**
 * Force IPv4 when env.DB_DISABLE_IPV6=true or when a manual override is set.
 * Returns { host?, servername? } to be used in Pool options / TLS SNI.
 */
async function ensureIPv4(connectionString, originalHostname) {
  if (!connectionString) {
    return {};
  }

  const resolvedOriginalHost =
    originalHostname ?? parseUrl(connectionString)?.hostname ?? undefined;

  // Manual override beats everything else (useful for debugging)
  const manualOverride = env.DB_IPV4_HOST?.trim();
  if (manualOverride) {
    console.info('Using manual IPv4 database host override');
    return {
      host: manualOverride,
      servername: resolvedOriginalHost,
    };
  }

  // If IPv6 is allowed, we only hint SNI servername
  if (!env.DB_DISABLE_IPV6) {
    return { servername: resolvedOriginalHost };
  }

  const hostname = resolvedOriginalHost;
  if (!hostname || hostname === 'localhost' || net.isIP(hostname) === 4) {
    return { servername: resolvedOriginalHost };
  }

  try {
    const lookupResult = await dns.lookup(hostname, { family: 4 });
    if (lookupResult?.family === 4 && lookupResult.address) {
      console.info(
        'Resolved database host to IPv4 address to avoid IPv6 connectivity issues'
      );
      return {
        host: lookupResult.address,
        servername: hostname, // keep original hostname for TLS SNI
      };
    }
  } catch (err) {
    if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
      console.info('No IPv4 DNS record for database host; using original hostname');
    } else {
      console.warn(
        'Unable to resolve IPv4 address for database host:',
        err?.message || err
      );
    }
  }

  return { servername: resolvedOriginalHost };
}

/**
 * Prefer IPv4 lookups for the internal resolver when DB_DISABLE_IPV6=true.
 * (pg will call this for DNS resolution when provided as Pool option.)
 */
function preferIPv4Lookup(hostname, options, callback) {
  if (!env.DB_DISABLE_IPV6) {
    return dnsLookup(hostname, options, callback);
  }

  let cb = callback;
  let opts = options;

  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  const lookupOptions = { ...opts, family: 4 };

  return dnsLookup(hostname, lookupOptions, (err, address, family) => {
    if (!err) {
      return cb?.(null, address, family);
    }

    // Fallback to default resolution if IPv4 is missing
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return dnsLookup(hostname, opts, cb);
    }

    return cb?.(err, address, family);
  });
}

// ----- Build final Pool options -----

const parsedUrl = parseUrl(env.DATABASE_URL);
const originalHostname = parsedUrl?.hostname;

const { host: ipv4HostOverride, servername: servernameHint } = await ensureIPv4(
  env.DATABASE_URL,
  originalHostname
);

// TLS: Supabase on Render uses a managed CA. The safe default is to accept it
// (rejectUnauthorized:false) and always set servername for SNI.
// If a CA is provided via DB_SSL_CA_CERT, we switch to strict verification.
const caCertificate = normaliseCertificate(env.DB_SSL_CA_CERT);
const hasCustomCA = !!caCertificate;

// Always set a servername for SNI (use the original hostname if possible).
const sslServername = servernameHint ?? originalHostname;

let sslConfig = {
  rejectUnauthorized: false, // default for Supabase managed certs on Render
  ...(sslServername ? { servername: sslServername } : {}),
};

if (hasCustomCA) {
  sslConfig = {
    rejectUnauthorized: true,
    ca: caCertificate,
    ...(sslServername ? { servername: sslServername } : {}),
  };
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ...(ipv4HostOverride ? { host: ipv4HostOverride } : {}),
  ssl: sslConfig,
  max: 10, // pgBouncer-friendly
  idleTimeoutMillis: 30_000,
  lookup: preferIPv4Lookup,
});

// Convenience helpers
export const query = (text, params) => pool.query(text, params);

export async function assertDb() {
  await pool.query('select 1');
}
