import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';
import { sendLoginEmail } from './email.js';
import { query } from '../../lib/db.js';

// naive per-email cooldown (in-memory; OK for dev)
const lastRequestPerEmail = new Map();

export async function requestMagicLink(email, req) {
  const now = Date.now();
  const last = lastRequestPerEmail.get(email) || 0;
  if (now - last < 30_000) throw new Error('Rate limited');
  lastRequestPerEmail.set(email, now);

  const { rowCount } = await query(
    `SELECT 1 FROM users WHERE email = $1;`,
    [email]
  );
  if (!rowCount) {
    req.log.info({ email }, 'magic-link requested for unknown email');
    return false;
  }

  const token = nanoid(32);
  const expiresAt = new Date(now + env.MAGIC_LINK_EXPIRY_MS);

  await query(
    `INSERT INTO magic_tokens (email, token, expires_at) VALUES ($1, $2, $3);`,
    [email, token, expiresAt]
  );

  const verifyUrl = `${env.APP_BASE_URL.replace(/\/+$/, '')}/auth/verify?token=${encodeURIComponent(
    token
  )}`;
  await sendLoginEmail(email, verifyUrl, req);
  return true;
}

export async function verifyMagicToken(token, req) {
  const { rows } = await query(
    `SELECT id, email, expires_at, used_at FROM magic_tokens WHERE token=$1;`,
    [token]
  );
  if (!rows.length) return null;
  const rec = rows[0];
  const now = new Date();

  if (rec.used_at || now > rec.expires_at) {
    await query(`DELETE FROM magic_tokens WHERE id=$1;`, [rec.id]); // clean up
    return null;
  }

  const { rowCount: userCount } = await query(
    `SELECT 1 FROM users WHERE email = $1;`,
    [rec.email]
  );
  if (!userCount) {
    await query(`DELETE FROM magic_tokens WHERE id=$1;`, [rec.id]);
    req.log.warn({ email: rec.email }, 'magic token without account');
    return null;
  }

  // mark single-use
  await query(`UPDATE magic_tokens SET used_at=NOW() WHERE id=$1;`, [rec.id]);

  req.log.info({ email: rec.email }, 'magic token verified');
  return { email: rec.email };
}
