import dns from 'node:dns/promises';
import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

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
    console.warn('Unable to resolve IPv4 address for database host:', err?.message || err);
  }

  return connectionString;
}

const connectionString = await ensureIPv4(env.DATABASE_URL);

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
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  lookup: preferIPv4Lookup,
});
