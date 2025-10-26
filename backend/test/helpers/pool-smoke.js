import { parentPort, workerData } from 'node:worker_threads';

const envOverrides = workerData?.env || {};
for (const [key, value] of Object.entries(envOverrides)) {
  if (value === undefined || value === null) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

try {
  const { pool } = await import('../../src/lib/db.js');

  const lookupResult = await new Promise((resolve, reject) => {
    pool.options.lookup('localhost', {}, (err, address, family) => {
      if (err) return reject(err);
      resolve({ address, family });
    });
  });

  await pool.end();

  parentPort?.postMessage({
    connectionString: pool.options.connectionString,
    ssl: pool.options.ssl,
    lookupResult,
  });
} catch (error) {
  parentPort?.postMessage({
    error: error?.message || String(error),
    stack: error?.stack,
  });
}
