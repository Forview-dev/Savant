import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

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
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    maxAge: env.JWT_EXPIRES * 1000,
    domain: env.COOKIE_DOMAIN,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
  });
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
