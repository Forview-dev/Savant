import dns from 'node:dns';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const lookup = env.DB_PREFER_IPV4
  ? (hostname, options, callback) => {
      const hasCallback = typeof callback === 'function';
      const opts = hasCallback ? options || {} : {};
      const cb = hasCallback ? callback : options;
      const merged = { ...opts, all: true };
      dns.lookup(hostname, merged, (err, addresses) => {
        if (err) return cb(err);
        const match = addresses.find((addr) => addr.family === 4) || addresses[0];
        if (!match) {
          return cb(new Error(`No DNS entries for ${hostname}`));
        }
        cb(null, match.address, match.family);
      });
    }
  : undefined;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  ...(lookup ? { lookup } : {}),
});
