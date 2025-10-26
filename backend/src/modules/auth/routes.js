import { Router } from 'express';
import { z } from 'zod';
import {
  MagicLinkRateLimitError,
  requestMagicLink,
  verifyMagicToken,
} from './service.js';
import { clearSessionCookie, setSessionCookie } from '../../middleware/auth.js';
// import { createRateLimiter } from '../../middleware/rateLimit.js';
import { env } from '../../config/env.js';

export const authRouter = Router();

const emailSchema = z.object({
  email: z.string().email().max(200),
});

// const magicLinkRateLimiter = createRateLimiter({
//   windowMs: 60 * 60 * 1000,
//   max: 5,
//   message: 'Too many login attempts. Please try again in a little while.',
// });

// authRouter.post('/magic-link', magicLinkRateLimiter, async (req, res) => {
authRouter.post('/magic-link', async (req, res) => {
  const parse = emailSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const { email } = parse.data;

  try {
    await requestMagicLink(email, req);
    return res
      .status(200)
      .json({ ok: true, message: 'Check your email for a login link.' });
  } catch (err) {
    if (err instanceof MagicLinkRateLimitError) {
      if (err.retryAfterSeconds) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      req.log.warn({ err, email }, 'magic-link request throttled');
      return res
        .status(429)
        .json({ error: 'Too many login attempts. Please try again shortly.' });
    }

    req.log.error({ err }, 'magic-link failed');
    return res
      .status(500)
      .json({ error: 'Unable to send login link. Please try again later.' });
  }
});

authRouter.get('/verify', async (req, res) => {
  const token = req.query.token?.toString() || '';
  if (!token) {
    return res.status(400).send('Missing token');
  }

  const verified = await verifyMagicToken(token, req);
  if (!verified) {
    clearSessionCookie(res);
    return res.status(400).send('Invalid or expired token.');
  }

  const role = verified.role ?? 'editor';
  if (!verified.role) {
    req.log?.warn({ email: verified.email }, 'No role found on verified token; using default');
  }
  const jwtPayload = { sub: verified.email, role };
  const jwtToken = req.app.get('signSession')(jwtPayload);
  setSessionCookie(res, jwtToken);

  res.setHeader('Cache-Control', 'no-store');
  // return res.redirect(303, env.FRONTEND_ORIGIN + '/app');
  return res.status(200).send(`
    <!doctype html>
    <meta charset="utf-8">
    <title>Savant – Signed In</title>
    <p>✅ Session cookie set for <strong>${verified.email}</strong>.</p>
    <p><a href="${env.FRONTEND_ORIGIN}/app">Continue to the app</a></p>
    <script>setTimeout(() => location.href='${env.FRONTEND_ORIGIN}/app', 1500);</script>
  `);
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});
