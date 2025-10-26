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
    'postgres://user:pass@db.example.com:5432/prod',
    'pool should keep the original connection string when applying IPv4 overrides'
  );

  assert.equal(
    message.host,
    '203.0.113.42',
    'pool should override the socket host when an explicit IPv4 override is supplied'
  );

  assert.deepEqual(
    message.ssl,
    { rejectUnauthorized: false, servername: 'db.example.com' },
    'pool should enable SSL with relaxed certificate validation and preserve original host for SNI'
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

test('pool infers SSL mode from connection string', async () => {
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgres://user:pass@db.example.com:5432/prod?sslmode=require',
    DB_DISABLE_IPV6: 'false',
  };

  const worker = runPoolSmoke(env);
  const [message] = await once(worker, 'message');

  if (message?.error) {
    throw new Error(`${message.error}\n${message.stack || ''}`.trim());
  }

  assert.equal(
    message.ssl?.rejectUnauthorized,
    false,
    'pool should relax certificate validation when sslmode=require'
  );
  assert.equal(
    message.ssl?.servername,
    'db.example.com',
    'pool should pass the original hostname as SNI even when not rewriting the URL'
  );

  await worker.terminate();
});

test('pool loads CA bundle when provided', async () => {
  const pem = [
    '-----BEGIN CERTIFICATE-----',
    'MIIBszCCAVmgAwIBAgIUWukd5d==',
    '-----END CERTIFICATE-----',
  ].join('\\n');

  const env = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgres://user:pass@db.example.com:5432/prod?sslmode=verify-full',
    DB_SSL_CA_CERT: pem,
  };

  const worker = runPoolSmoke(env);
  const [message] = await once(worker, 'message');

  if (message?.error) {
    throw new Error(`${message.error}\n${message.stack || ''}`.trim());
  }

  assert.ok(message.ssl);
  assert.equal(
    message.ssl.rejectUnauthorized,
    true,
    'pool should enforce certificate validation when CA bundle supplied'
  );
  assert.equal(
    message.ssl.servername,
    'db.example.com',
    'pool should retain the original hostname for SNI when CA bundle is present'
  );
  assert.equal(message.ssl.ca, pem.replace(/\\n/g, '\n'));

  await worker.terminate();
});
