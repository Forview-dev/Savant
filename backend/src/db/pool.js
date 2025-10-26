import dns from 'node:dns/promises';
import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

function parseUrl(connectionString) {
  if (!connectionString) return undefined;
  try {
    return new URL(connectionString);
  } catch (err) {
    console.warn('Failed to parse DATABASE_URL:', err?.message || err);
    return undefined;
  }
}

function normaliseCertificate(value) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const material = trimmed.includes('-----BEGIN')
    ? trimmed.replace(/\\n/g, '\n')
    : Buffer.from(trimmed, 'base64').toString('utf8');

  return material;
}

function rewriteHost(connectionString, host) {
  try {
    const url = new URL(connectionString);
    url.hostname = host;
    url.host = host + (url.port ? `:${url.port}` : '');
    return url.toString();
  } catch (err) {
    console.warn('Failed to rewrite DATABASE_URL host:', err?.message || err);
    return connectionString;
  }
}

async function ensureIPv4(connectionString) {
  if (!connectionString) return connectionString;

  const manualOverride = env.DB_IPV4_HOST?.trim();
  if (manualOverride) {
    return rewriteHost(connectionString, manualOverride);
  }

  if (!env.DB_DISABLE_IPV6) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;
    if (!hostname || hostname === 'localhost' || net.isIP(hostname) === 4) {
      return connectionString;
    }

    const lookupResult = await dns.lookup(hostname, { family: 4 });
    if (lookupResult?.family === 4 && lookupResult.address) {
      console.info('Resolved database host to IPv4 address to avoid IPv6 connectivity issues');
      return rewriteHost(connectionString, lookupResult.address);
    }
  } catch (err) {
    if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
      console.info('No IPv4 DNS record for database host; using original hostname');
    } else {
      console.warn('Unable to resolve IPv4 address for database host:', err?.message || err);
    }
  }

  return connectionString;
}

const originalUrl = parseUrl(env.DATABASE_URL);
const originalHostname = originalUrl?.hostname;

const connectionString = await ensureIPv4(env.DATABASE_URL);
const parsedUrl = parseUrl(connectionString);
const sslMode = parsedUrl?.searchParams
  ?.get('sslmode')
  ?.toString()
  .trim()
  .toLowerCase();

const sslModeRequires = sslMode
  ? !['disable', 'allow', 'prefer'].includes(sslMode)
  : false;
const sslModeStrict = sslMode
  ? ['verify-ca', 'verify-full'].includes(sslMode)
  : false;

const sslEnabled =
  env.DB_SSL !== undefined
    ? env.DB_SSL
    : sslModeRequires || env.NODE_ENV === 'production';

const explicitRejectUnauthorized = env.DB_SSL_REJECT_UNAUTHORIZED;

const sslRejectUnauthorized =
  explicitRejectUnauthorized !== undefined
    ? explicitRejectUnauthorized
    : sslModeStrict;

const caCertificate = normaliseCertificate(env.DB_SSL_CA_CERT);

const effectiveHostname = parsedUrl?.hostname;
const sslServername =
  originalHostname && effectiveHostname && originalHostname !== effectiveHostname
    ? originalHostname
    : effectiveHostname ?? originalHostname;

const sslConfig = sslEnabled
  ? {
      rejectUnauthorized:
        caCertificate && explicitRejectUnauthorized === undefined
          ? true
          : sslRejectUnauthorized ?? false,
      ...(caCertificate ? { ca: caCertificate } : {}),
      ...(sslServername ? { servername: sslServername } : {}),
    }
  : false;

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

    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return dnsLookup(hostname, opts, cb);
    }

    return cb?.(err, address, family);
  });
}

export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
  lookup: preferIPv4Lookup,
});
