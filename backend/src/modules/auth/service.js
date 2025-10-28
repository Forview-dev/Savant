import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { sendLoginEmail } from './email.js';
import { pool } from '../../lib/db.js';

// naive per-email cooldown (in-memory; OK for dev)
const lastRequestPerEmail = new Map();
let deliverMagicLink = sendLoginEmail;

const cooldownMs = Number(env.MAGIC_LINK_MIN_INTERVAL_MS ?? 30_000);

function buildMagicLinkUrl(token) {
  const rawBase = (env.FRONTEND_ORIGIN || '').trim();
  if (!rawBase) {
    throw new Error('FRONTEND_ORIGIN is not configured');
  }
  const base = rawBase.replace(/\/+$/, '');
  return `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

export class MagicLinkRateLimitError extends Error {
  constructor(retryAfterSeconds) {
    super('Rate limited');
    this.name = 'MagicLinkRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function requestMagicLink(email, req) {
  const now = Date.now();
  const last = lastRequestPerEmail.get(email) || 0;
  const remainingMs = cooldownMs - (now - last);
  if (remainingMs > 0) {
    const retryAfterSeconds = Math.ceil(remainingMs / 1000);
    throw new MagicLinkRateLimitError(retryAfterSeconds);
  }

  const { rowCount } = await pool.query(
    `SELECT 1 FROM users WHERE email = $1;`,
    [email]
  );
  if (!rowCount) {
    req.log.info({ email }, 'magic-link requested for unknown email');
    return false;
  }

  const token = nanoid(32);
  const expiresAt = new Date(now + 15 * 60 * 1000); // 15 min
  let tokenInserted = false;

  try {
    await pool.query(
      `INSERT INTO magic_tokens (email, token, expires_at) VALUES ($1, $2, $3);`,
      [email, token, expiresAt]
    );
    tokenInserted = true;

    // Build verify URL that lands on the FE proxy (/api) which forwards to the backend.
    const verifyUrl = buildMagicLinkUrl(token);

    // Diagnostics: ensure link points to the FE origin and uses https
    try {
      const v = new URL(verifyUrl);
      const fe = new URL(env.FRONTEND_ORIGIN);
      if (v.host.toLowerCase() !== fe.host.toLowerCase()) {
        req.log?.warn({ expectedHost: fe.host, linkHost: v.host }, 'magic-link host differs from FRONTEND_ORIGIN');
      }
      if (v.protocol !== 'https:') {
        req.log?.warn({ protocol: v.protocol, verifyUrl }, 'FRONTEND_ORIGIN is not https; cookies may be rejected by browsers');
      }
    } catch (_e) {
      req.log?.warn({ verifyUrl }, 'verify URL is not a valid absolute URL');
    }

    req.log?.info({ email, verifyUrl }, 'magic-link generated (via FE proxy)');
    await deliverMagicLink(email, verifyUrl, req);
    lastRequestPerEmail.set(email, Date.now());
    return true;
  } catch (err) {
    if (tokenInserted) {
      await pool
        .query(`DELETE FROM magic_tokens WHERE token = $1;`, [token])
        .catch(() => {});
    }
    throw err;
  }
}

export async function verifyMagicToken(token, req) {
  const { rows } = await pool.query(
    `
    SELECT mt.id, mt.email, mt.expires_at, mt.used_at, u.role
      FROM magic_tokens mt
      LEFT JOIN users u ON u.email = mt.email
     WHERE mt.token = $1;
    `,
    [token]
  );
  if (!rows.length) return null;
  const rec = rows[0];
  const now = new Date();

  if (rec.used_at || now > rec.expires_at) {
    await pool.query(`DELETE FROM magic_tokens WHERE id=$1;`, [rec.id]); // clean up
    return null;
  }

  if (!rec.role) {
    await pool.query(`DELETE FROM magic_tokens WHERE id=$1;`, [rec.id]);
    req.log?.warn({ email: rec.email }, 'magic token without account');
    return null;
  }

  // mark single-use
  await pool.query(`UPDATE magic_tokens SET used_at=NOW() WHERE id=$1;`, [rec.id]);

  req.log?.info({ email: rec.email, role: rec.role }, 'magic token verified');
  return { email: rec.email, role: rec.role };
}

export const __test = {
  resetCooldown() {
    lastRequestPerEmail.clear();
  },
  getLastRequest(email) {
    return lastRequestPerEmail.get(email);
  },
  setSendLoginEmail(mockFn) {
    deliverMagicLink = mockFn;
  },
  resetSendLoginEmail() {
    deliverMagicLink = sendLoginEmail;
  },
};

export async function listMagicLinkRequests(limit = 200) {
  const parsed = Number(limit);
  const safeLimit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 200;
  const { rows } = await pool.query(
    `
    SELECT email, token, expires_at, used_at, created_at
      FROM magic_tokens
     ORDER BY created_at DESC
     LIMIT $1;
    `,
    [safeLimit]
  );

  return rows.map(row => ({
    email: row.email,
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    verifyUrl: buildMagicLinkUrl(row.token),
  }));
}

export const __internal = { buildMagicLinkUrl };
