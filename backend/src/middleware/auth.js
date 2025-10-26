import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Compute cross-site safe cookie options
function buildCookieOptions() {
  // For production (Render), cookies must be cross-site: SameSite=None; Secure
  const isProd = env.NODE_ENV === 'production';
  const sameSite = isProd ? 'none' : (env.COOKIE_SAMESITE || 'lax');
  const secure = isProd ? true : !!env.COOKIE_SECURE;

  const opts = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: env.JWT_EXPIRES * 1000,
    // IMPORTANT: do NOT set domain for cross-origin FE/BE; let it default to backend host
  };
  return opts;
}

export function signSession(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  const opts = buildCookieOptions();
  res.cookie(env.COOKIE_NAME, token, opts);
}

export function clearSessionCookie(res) {
  const opts = buildCookieOptions();
  // clearCookie ignores maxAge, but keeping sameSite/secure/path ensures the deletion matches the original cookie
  delete opts.maxAge;
  res.clearCookie(env.COOKIE_NAME, opts);
}

export function requireAuthOptional(req, _res, next) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    req.user = null;
    return next();
  }
  const decoded = verifySession(token);
  req.user = decoded ? { email: decoded.sub, role: decoded.role } : null;
  next();
}

export function requireAuthStrict(req, res, next) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const decoded = verifySession(token);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  req.user = { email: decoded.sub, role: decoded.role };
  next();
}

export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
