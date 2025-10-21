import { Router } from 'express';
import { z } from 'zod';
import { requireAuthStrict } from '../../middleware/auth.js';
import { sanitizeHtml } from './sanitize.js';
import {
  listSops,
  listSopsFiltered,
  getSop,
  createSop,
  updateSop,
  softDeleteSop,
  listVersions,
  getVersion,
  restoreVersion,
} from './store.js';

export const sopsRouter = Router();

const upsertSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().max(100).optional().default('General'),
  tags: z.array(z.string().max(50)).optional().default([]),
  delta: z.any(), // Quill Delta JSON
  html: z.string().min(0),
  message: z.string().max(500).optional(),
});

// List with optional filters
sopsRouter.get('/', requireAuthStrict, async (req, res) => {
  const q = (req.query.q || '').toString();
  const category = (req.query.category || '').toString();
  const tagsRaw = req.query.tags;
  let tags = [];
  if (typeof tagsRaw === 'string') {
    tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(tagsRaw)) {
    tags = tagsRaw.map(s => s.toString().trim()).filter(Boolean);
  }
  const sort = (req.query.sort || 'updated_desc').toString();

  const useFilters = q || category || (tags && tags.length);
  const items = useFilters
    ? await listSopsFiltered({ q, category, tags, sort })
    : await listSops();

  res.json({ items });
});

// Create
sopsRouter.post('/', requireAuthStrict, async (req, res) => {
  const parse = upsertSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid payload' });
  const { title, category, tags, delta, html, message } = parse.data;
  const sop = await createSop({
    title,
    category,
    tags,
    delta,
    html: sanitizeHtml(html),
    author_email: req.user.email,
    message,
  });
  res.status(201).json(sop);
});

// Read
sopsRouter.get('/:id', requireAuthStrict, async (req, res) => {
  const id = Number(req.params.id);
  const sop = await getSop(id);
  if (!sop) return res.status(404).json({ error: 'Not found' });
  res.json(sop);
});

// Update
sopsRouter.put('/:id', requireAuthStrict, async (req, res) => {
  const id = Number(req.params.id);
  const parse = upsertSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid payload' });
  const { title, category, tags, delta, html, message } = parse.data;
  const updated = await updateSop(id, {
    title,
    category,
    tags,
    delta,
    html: sanitizeHtml(html),
    author_email: req.user.email,
    message,
  });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

// Delete (soft)
sopsRouter.delete('/:id', requireAuthStrict, async (req, res) => {
  const id = Number(req.params.id);
  const ok = await softDeleteSop(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Versions
sopsRouter.get('/:id/versions', requireAuthStrict, async (req, res) => {
  const id = Number(req.params.id);
  const items = await listVersions(id);
  res.json({ items });
});

sopsRouter.get('/:id/versions/:no', requireAuthStrict, async (req, res) => {
  const id = Number(req.params.id);
  const no = Number(req.params.no);
  const v = await getVersion(id, no);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

sopsRouter.post('/:id/versions/:no/restore', requireAuthStrict, async (req, res) => {
  const id = Number(req.params.id);
  const no = Number(req.params.no);
  const updated = await restoreVersion(id, no, req.user.email);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});
