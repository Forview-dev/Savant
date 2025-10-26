import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { sendLoginEmail } from './email.js';
import { pool } from '../../lib/db.js';

// naive per-email cooldown (in-memory; OK for dev)
const lastRequestPerEmail = new Map();
let deliverMagicLink = sendLoginEmail;

const cooldownMs = Number(env.MAGIC_LINK_MIN_INTERVAL_MS ?? 30_000);

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

    const verifyUrl = `${env.APP_BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`;
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
