import { query } from '../lib/db.js';

export async function withFreshRole(req, _res, next) {
  try {
    if (!req.user?.email) return next();
    const { rows } = await query(
      `SELECT role FROM users WHERE email = $1 LIMIT 1`,
      [req.user.email]
    );
    if (rows[0]?.role) {
      req.user.role = rows[0].role; // override with fresh role
    }
  } catch (e) {
    // non-fatal; keep going with existing req.user
    console.warn('withFreshRole: failed to refresh role', e?.message || e);
  }
  next();
}
