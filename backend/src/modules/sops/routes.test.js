import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/testdb';

const queryCalls = [];
const dbModule = await import('../../lib/db.js');
const originalQuery = dbModule.query;

const { signSession } = await import('../../middleware/auth.js');
const { sopsRouter, __setSopsQueryExecutor } = await import('./routes.js');

__setSopsQueryExecutor(async (...args) => {
  queryCalls.push(args);
  return { rows: [{ id: 'new-sop-id' }] };
});

function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(sopsRouter);
  return app;
}

function sopCookie(role) {
  const token = signSession({ sub: `${role}@example.com`, role });
  return `sid=${token}`;
}

async function sendRequest(method, path, { body, cookie } = {}) {
  const app = createApp();
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : address;

  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return { status: response.status, body: data };
  } finally {
    server.close();
    await new Promise(resolve => server.once('close', resolve));
  }
}

beforeEach(() => {
  queryCalls.length = 0;
});

after(() => {
  __setSopsQueryExecutor(originalQuery);
});

test('POST /sops rejects anonymous users', async () => {
  const res = await sendRequest('POST', '/sops', {
    body: { title: 'New SOP', html: '<p>Body</p>' },
  });

  assert.equal(res.status, 401);
  assert.equal(queryCalls.length, 0);
});

test('POST /sops forbids readers', async () => {
  const res = await sendRequest('POST', '/sops', {
    body: { title: 'New SOP', html: '<p>Body</p>' },
    cookie: sopCookie('reader'),
  });

  assert.equal(res.status, 403);
  assert.equal(queryCalls.length, 0);
});

test('POST /sops allows editors and admins', async () => {
  for (const role of ['editor', 'admin']) {
    const res = await sendRequest('POST', '/sops', {
      body: { title: 'New SOP', html: '<p>Body</p>' },
      cookie: sopCookie(role),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'new-sop-id');
  }
  assert.equal(queryCalls.length, 2);
});
