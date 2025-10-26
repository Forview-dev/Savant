process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:4000';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.MAGIC_LINK_MIN_INTERVAL_MS = '1000';

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const dbModule = await import('../src/lib/db.js');
const { requestMagicLink, MagicLinkRateLimitError, __test } = await import(
  '../src/modules/auth/service.js'
);

function createReq() {
  return { log: { info: () => {}, warn: () => {}, error: () => {} } };
}

test('cooldown only applies after a successful email send', async t => {
  __test.resetCooldown();
  let selectCalls = 0;
  let insertCalls = 0;
  let deleteCalls = 0;
  const queries = mock.method(dbModule.pool, 'query', async (sql, params) => {
    const text = sql.trim().toLowerCase();
    if (text.startsWith('select 1 from users')) {
      selectCalls += 1;
      return { rowCount: 1, rows: [{ exists: true }] };
    }
    if (text.startsWith('insert into magic_tokens')) {
      insertCalls += 1;
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('delete from magic_tokens')) {
      deleteCalls += 1;
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  let sendCalls = 0;
  __test.setSendLoginEmail(async () => {
    sendCalls += 1;
  });

  t.after(() => {
    queries.mock.restore();
    __test.resetCooldown();
    __test.resetSendLoginEmail();
  });

  const email = 'user@example.com';

  const first = await requestMagicLink(email, createReq());
  assert.equal(first, true);
  assert.equal(selectCalls, 1);
  assert.equal(insertCalls, 1);
  assert.equal(deleteCalls, 0);
  assert.equal(sendCalls, 1);

  await assert.rejects(
    () => requestMagicLink(email, createReq()),
    err => err instanceof MagicLinkRateLimitError
  );
});

test('failed queries do not trigger cooldown', async t => {
  __test.resetCooldown();
  let attempts = 0;
  const queries = mock.method(dbModule.pool, 'query', async sql => {
    const text = sql.trim().toLowerCase();
    if (text.startsWith('select 1 from users')) {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('temporary failure');
      }
      return { rowCount: 1, rows: [{ exists: true }] };
    }
    if (text.startsWith('insert into magic_tokens')) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  let sendCalls = 0;
  __test.setSendLoginEmail(async () => {
    sendCalls += 1;
  });

  t.after(() => {
    queries.mock.restore();
    __test.resetCooldown();
    __test.resetSendLoginEmail();
  });

  const email = 'retry@example.com';

  await assert.rejects(() => requestMagicLink(email, createReq()), /temporary failure/);
  const second = await requestMagicLink(email, createReq());
  assert.equal(second, true);
  assert.equal(sendCalls, 1);
});

test('email send failures clean up inserted token and skip cooldown', async t => {
  __test.resetCooldown();
  let insertedToken;
  const queries = mock.method(dbModule.pool, 'query', async (sql, params) => {
    const text = sql.trim().toLowerCase();
    if (text.startsWith('select 1 from users')) {
      return { rowCount: 1, rows: [{ exists: true }] };
    }
    if (text.startsWith('insert into magic_tokens')) {
      insertedToken = params[1];
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('delete from magic_tokens')) {
      assert.equal(params[0], insertedToken);
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  __test.setSendLoginEmail(async () => {
    throw new Error('smtp offline');
  });

  t.after(() => {
    queries.mock.restore();
    __test.resetCooldown();
    __test.resetSendLoginEmail();
  });

  const email = 'fail@example.com';

  await assert.rejects(() => requestMagicLink(email, createReq()), /smtp offline/);
  assert.equal(__test.getLastRequest(email), undefined);
});
