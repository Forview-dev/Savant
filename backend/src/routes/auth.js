// src/routes/auth.js
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { generateTokenRaw, hashToken } = require('../utils/token');
const { sendMagicLinkEmail } = require('../utils/mailer');
const { MAGIC_LINK_EXPIRY_MIN } = require('../config');
const { z } = require('zod');

// POST /api/auth/magic-request
router.post('/magic-request', async (req, res) => {
  const bodySchema = z.object({
    email: z.string().email(),
    redirect: z.string().optional()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const { email, redirect } = parsed.data;
  const normalized = email.trim().toLowerCase();

  // Always return 200 to avoid user enumeration; only send if user exists
  const user = await prisma.user.findUnique({ where: { email: normalized }});
  if (!user) {
    // intentionally silent
    return res.json({ ok: true });
  }

  // rate-limiting hooks would go here (per-email / per-ip)

  const rawToken = generateTokenRaw(48);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MIN * 60000);

  await prisma.magicLink.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      requestIp: req.ip,
      requestUA: req.get('User-Agent') || undefined,
      redirect
    }
  });

  const base = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  const link = `${base}/login.html?token=${encodeURIComponent(rawToken)}`;

  try {
    await sendMagicLinkEmail({ to: normalized, link });
  } catch (err) {
    console.error('Failed to send magic link email:', err);
    // still return ok to caller
  }

  return res.json({ ok: true });
});

// POST /api/auth/magic-verify
router.post('/magic-verify', async (req, res) => {
  const bodySchema = z.object({
    token: z.string()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const { token } = parsed.data;
  const tokenHash = hashToken(token);

  // find token not used and not expired
  const record = await prisma.magicLink.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!record) return res.status(401).json({ error: 'invalid_or_expired' });

  // mark used atomically
  await prisma.magicLink.update({
    where: { id: record.id },
    data: { usedAt: new Date() }
  });

  // create session
  req.session.userId = record.user.id;
  req.session.role = record.user.role || 'editor';

  // optional: create audit/log entry
  await prisma.auditLog.create({
    data: {
      userId: record.user.id,
      action: 'magic-verify',
      meta: { ip: req.ip, ua: req.get('User-Agent') }
    }
  });

  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'not_authenticated' });
  const user = await prisma.user.findUnique({ where: { id: req.session.userId }});
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

module.exports = router;
