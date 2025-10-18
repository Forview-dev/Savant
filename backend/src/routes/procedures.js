// src/routes/procedures.js
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { z } = require('zod');

// middleware to enforce auth
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

// GET /api/procedures?q=
router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString();
  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { summary: { contains: q, mode: 'insensitive' } },
          { contentHtml: { contains: q, mode: 'insensitive' } }
        ],
        status: 'published'
      }
    : { status: 'published' };

  const items = await prisma.procedure.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 100
  });

  // add editable flag if current user is author or admin
  const userId = req.session?.userId;
  const enriched = items.map(i => ({
    id: i.id,
    title: i.title,
    summary: i.summary,
    content_html: i.contentHtml,
    updatedAt: i.updatedAt,
    editable: !!userId && (i.authorId === userId || req.session?.role === 'admin')
  }));

  res.json(enriched);
});

// GET /api/procedures/:id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const proc = await prisma.procedure.findUnique({ where: { id } });
  if (!proc) return res.status(404).json({ error: 'not_found' });

  // allow reading published items or allow if user is author/admin
  if (proc.status !== 'published') {
    const uid = req.session?.userId;
    if (!uid || (proc.authorId !== uid && req.session?.role !== 'admin')) {
      return res.status(403).json({ error: 'forbidden' });
    }
  }

  res.json(proc);
});

// POST /api/procedures  (create) — auth required
router.post('/', requireAuth, async (req, res) => {
  const bodySchema = z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    content_html: z.string().optional(),
    content_delta: z.any().optional(),
    status: z.string().optional()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const data = parsed.data;
  const created = await prisma.procedure.create({
    data: {
      title: data.title,
      summary: data.summary,
      contentHtml: data.content_html,
      contentDelta: data.content_delta,
      status: data.status || 'draft',
      authorId: req.session.userId
    }
  });

  // create a version
  await prisma.procedureVersion.create({
    data: {
      procedureId: created.id,
      contentHtml: data.content_html,
      contentDelta: data.content_delta,
      authorId: req.session.userId
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.session.userId,
      action: 'create_procedure',
      procedureId: created.id
    }
  });

  res.status(201).json(created);
});

// PUT /api/procedures/:id (update) — auth required
router.put('/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const bodySchema = z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    content_html: z.string().optional(),
    content_delta: z.any().optional(),
    status: z.string().optional()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const existing = await prisma.procedure.findUnique({ where: { id }});
  if (!existing) return res.status(404).json({ error: 'not_found' });

  // authorization: only author or admin can edit
  const uid = req.session.userId;
  if (existing.authorId !== uid && req.session.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const updated = await prisma.procedure.update({
    where: { id },
    data: {
      title: parsed.data.title,
      summary: parsed.data.summary,
      contentHtml: parsed.data.content_html,
      contentDelta: parsed.data.content_delta,
      status: parsed.data.status
    }
  });

  // add a new version
  await prisma.procedureVersion.create({
    data: {
      procedureId: id,
      contentHtml: parsed.data.content_html,
      contentDelta: parsed.data.content_delta,
      authorId: uid
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: uid,
      action: 'update_procedure',
      procedureId: id
    }
  });

  res.json(updated);
});

// DELETE /api/procedures/:id (admin only)
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const id = req.params.id;
  await prisma.procedure.delete({ where: { id }});
  await prisma.auditLog.create({ data: { userId: req.session.userId, action: 'delete_procedure', procedureId: id }});
  res.json({ ok: true });
});

module.exports = router;
