import { Router } from 'express';
import { z } from 'zod';
import { requestMagicLink, verifyMagicToken } from './service.js';
import { clearSessionCookie, setSessionCookie } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { env } from '../../config/env.js';

export const authRouter = Router();

const emailSchema = z.object({
  email: z.string().email().max(200),
});

const magicLinkRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in a little while.',
});

authRouter.post('/magic-link', magicLinkRateLimiter, async (req, res) => {
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
    req.log.error({ err }, 'magic-link failed');
    return res.status(429).json({ error: 'Please try again later.' });
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

  const jwtPayload = { sub: verified.email, role: 'editor' };
  const jwtToken = req.app.get('signSession')(jwtPayload);
  setSessionCookie(res, jwtToken);

  return res.redirect(302, env.FRONTEND_ORIGIN + '/');
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});
