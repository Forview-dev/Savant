process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:4000';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRES = process.env.JWT_EXPIRES || '3600';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const { app } = await import('../src/server.js');
const { env } = await import('../src/config/env.js');
const { pool: authPool } = await import('../src/db/pool.js');
const { pool: libPool } = await import('../src/lib/db.js');

function createLogger() {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop };
}

function createResponse() {
  return {
    statusCode: 200,
    location: undefined,
    body: undefined,
    cookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    redirect(statusOrUrl, maybeUrl) {
      if (typeof maybeUrl === 'undefined') {
        this.statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
        this.location = typeof statusOrUrl === 'string' ? statusOrUrl : undefined;
      } else {
        this.statusCode = statusOrUrl;
        this.location = maybeUrl;
      }
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie() {
      return this;
    },
  };
}

function getVerifyHandler() {
  if (!getVerifyHandler.cached) {
    const authLayer = app._router.stack.find(
      layer => layer.name === 'router' && layer.regexp && layer.regexp.toString().includes('\\/auth')
    );
    const verifyLayer = authLayer.handle.stack.find(
      layer => layer.route?.path === '/verify' && layer.route.methods.get
    );
    getVerifyHandler.cached = verifyLayer.route.stack[verifyLayer.route.stack.length - 1].handle;
  }
  return getVerifyHandler.cached;
}

function getMeHandlers() {
  if (!getMeHandlers.cached) {
    const meLayer = app._router.stack.find(layer => layer.route?.path === '/me');
    const [authMw, handler] = meLayer.route.stack.map(item => item.handle);
    getMeHandlers.cached = { authMw, handler };
  }
  return getMeHandlers.cached;
}

function createMagicTokenStub({ token, email, role }) {
  const future = new Date(Date.now() + 60_000);
  const recordId = token.length + role.length;
  const record = { id: recordId, email, expires_at: future, used_at: null, role };
  const originalQuery = authPool.query.bind(authPool);

  let selectCalls = 0;
  let updateCalls = 0;

  authPool.query = async (sql, params) => {
    const normalized = sql.trim().toLowerCase();

    if (normalized.startsWith('select') && normalized.includes('from magic_tokens')) {
      selectCalls += 1;
      assert.equal(params[0], token);
      return { rows: [record], rowCount: 1 };
    }

    if (normalized.startsWith('update magic_tokens')) {
      updateCalls += 1;
      assert.equal(params[0], record.id);
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith('delete from magic_tokens')) {
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected query: ${sql}`);
  };

  return () => {
    authPool.query = originalQuery;
    assert.equal(selectCalls, 1);
    assert.equal(updateCalls, 1);
  };
}

function createUserRoleStub({ email, role }) {
  const originalConnect = libPool.connect.bind(libPool);
  let queryCalls = 0;

  libPool.connect = async () => ({
    query: async (sql, params) => {
      queryCalls += 1;
      const normalized = sql.trim().toLowerCase();
      assert.ok(normalized.includes('from users'));
      assert.equal(params[0], email);
      return { rows: [{ role }], rowCount: 1 };
    },
    release: () => {},
  });

  return () => {
    libPool.connect = originalConnect;
    assert.equal(queryCalls, 1);
  };
}

async function invokeVerify(token) {
  const verifyHandler = getVerifyHandler();
  const req = { query: { token }, app, log: createLogger() };
  const res = createResponse();
  await verifyHandler(req, res, () => {});
  return res;
}

async function invokeMe(sessionToken) {
  const { authMw, handler } = getMeHandlers();
  const req = { cookies: { [env.COOKIE_NAME]: sessionToken }, log: createLogger() };
  const res = createResponse();

  await new Promise((resolve, reject) => {
    authMw(req, res, err => (err ? reject(err) : resolve()));
  });
  await handler(req, res, () => {});
  return res;
}

async function runRoleFlow(t, { token, email, role }) {
  const restoreMagic = createMagicTokenStub({ token, email, role });
  const restoreUserRole = createUserRoleStub({ email, role });

  t.after(() => {
    restoreMagic();
    restoreUserRole();
  });

  const verifyRes = await invokeVerify(token);
  assert.equal(verifyRes.statusCode, 302);
  assert.equal(verifyRes.location, env.FRONTEND_ORIGIN + '/');
  const sessionCookie = verifyRes.cookies.find(c => c.name === env.COOKIE_NAME);
  assert.ok(sessionCookie, 'session cookie set');

  const tokenValue = sessionCookie.value;
  const decoded = jwt.verify(tokenValue, env.JWT_SECRET);
  assert.equal(decoded.sub, email);
  assert.equal(decoded.role, role);

  const meRes = await invokeMe(tokenValue);
  assert.equal(meRes.statusCode, 200);
  assert.deepEqual(meRes.body, {
    user: {
      email,
      role,
    },
  });
}

test('editor login preserves role in JWT and /me', async t => {
  await runRoleFlow(t, {
    token: 'editor-token',
    email: 'editor@example.com',
    role: 'editor',
  });
});

test('admin login preserves role in JWT and /me', async t => {
  await runRoleFlow(t, {
    token: 'admin-token',
    email: 'admin@example.com',
    role: 'admin',
  });
});
