import dns from 'node:dns';
import net from 'node:net';
import { Pool } from 'pg';
import { env } from '../config/env.js';

function preferIPv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const family = net.isIP(hostname);
  if (family === 4 || family === 6) {
    callback(null, hostname, family);
    return;
  }

  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    if (!addresses || addresses.length === 0) {
      callback(new Error(`No addresses found for ${hostname}`));
      return;
    }

    const ipv4 = addresses.find((addr) => addr.family === 4);
    const selected = ipv4 ?? addresses[0];

    if (ipv4) {
      console.info(
        'Resolved database host to IPv4 address to avoid IPv6 connectivity issues',
      );
    }

    callback(null, selected.address, selected.family);
  });
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  lookup: preferIPv4Lookup,
});
