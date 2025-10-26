import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';

const workerUrl = new URL('./helpers/pool-smoke.js', import.meta.url);

function runPoolSmoke(env) {
  const worker = new Worker(workerUrl, {
    workerData: { env },
  });
  return worker;
}

test('shared pool honors production SSL and IPv4 settings', async () => {
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://user:pass@db.example.com:5432/prod',
    DB_SSL: 'true',
    DB_DISABLE_IPV6: 'true',
    DB_IPV4_HOST: '203.0.113.42',
  };

  const worker = runPoolSmoke(env);
  const [message] = await once(worker, 'message');

  if (message?.error) {
    throw new Error(`${message.error}\n${message.stack || ''}`.trim());
  }

  assert.equal(
    message.connectionString,
    'postgres://user:pass@203.0.113.42:5432/prod',
    'pool should rewrite host to explicit IPv4 override'
  );

  assert.deepEqual(
    message.ssl,
    { rejectUnauthorized: false },
    'pool should enable SSL with relaxed certificate validation'
  );

  assert.ok(message.lookupResult);
  assert.equal(
    message.lookupResult.family,
    4,
    'pool DNS lookup should report IPv4 when IPv6 is disabled'
  );
  assert.match(message.lookupResult.address, /^(127\.0\.0\.1|::ffff:127\.0\.0\.1)$/);

  await worker.terminate();
});
