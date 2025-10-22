import express from 'express';
import { query } from '../../lib/db.js';
import { requireAuthOptional } from '../../middleware/auth.js';

const sopsRouter = express.Router();

/* =========================
   Helpers
   ========================= */

function parseLimit(input, fallback = 200, max = 500) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}
function parseOffset(input) {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
function normalizeTags(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return [raw];
  return raw?.length ? raw : [];
}

/**
 * Build WHERE clause for filters.
 * Supports:
 * - client=1/0         → is_client true/false
 * - client_name        → ILIKE
 * - q                  → ILIKE on title/category/client_name
 * - category           → ILIKE
 * - tags=a,b,c         → JSONB contains all
 */
function buildWhere(params) {
  const where = [];
  const args = [];

  if (params.client === '1') {
    where.push(`is_client = true`);
  } else if (params.client === '0') {
    where.push(`is_client = false`);
  }

  if (params.client_name) {
    args.push(`%${params.client_name}%`);
    where.push(`client_name ILIKE $${args.length}`);
  }

  if (params.q) {
    args.push(`%${params.q}%`);
    where.push(
      `(title ILIKE $${args.length} OR category ILIKE $${args.length} OR coalesce(client_name,'') ILIKE $${args.length})`
    );
  }

  if (params.category) {
    args.push(`%${params.category}%`);
    where.push(`category ILIKE $${args.length}`);
  }

  if (params.tags) {
    const tagsArr = String(params.tags)
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (tagsArr.length) {
      args.push(JSON.stringify(tagsArr));
      where.push(`tags @> $${args.length}::jsonb`);
    }
  }

  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { sql, args };
}

/* =========================
   Routes
   ========================= */

/**
 * GET /sops
 * Query params:
 *   q, category, tags, client, client_name, limit, offset
 */
sopsRouter.get('/sops', requireAuthOptional, async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500);
    const offset = parseOffset(req.query.offset);

    const { sql, args } = buildWhere(req.query);

    const { rows } = await query(
      `
      SELECT id, title, category, tags, current_html, is_client, client_name, updated_at
      FROM sops
      ${sql}
      ORDER BY updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
      `,
      args
    );

    const items = rows.map(r => ({
      ...r,
      tags: normalizeTags(r.tags),
      is_client: !!r.is_client,
      client_name: r.client_name || null,
    }));

    res.json({ items, limit, offset, count: items.length });
  } catch (e) {
    console.error('GET /sops failed:', e);
    res.status(500).json({ error: 'Failed to list SOPs' });
  }
});

/**
 * GET /sops/:id
 */
sopsRouter.get('/sops/:id', requireAuthOptional, async (req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT id, title, category, tags, current_html, is_client, client_name, updated_at
      FROM sops
      WHERE id = $1
      `,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const r = rows[0];
    res.json({
      ...r,
      tags: normalizeTags(r.tags),
      is_client: !!r.is_client,
      client_name: r.client_name || null,
    });
  } catch (e) {
    console.error('GET /sops/:id failed:', e);
    res.status(500).json({ error: 'Failed to load SOP' });
  }
});

/**
 * POST /sops
 * Body: { title, category, tags[], html, delta?, message?, is_client?, client_name? }
 */
sopsRouter.post('/sops', requireAuthOptional, async (req, res) => {
  try {
    const { title, category, tags, html, delta, message, is_client, client_name } = req.body || {};
    if (!title || !html) return res.status(400).json({ error: 'title and html are required' });

    const safeTags = Array.isArray(tags) ? tags : [];
    const clientFlag = !!is_client;
    const clientName = clientFlag ? (client_name || null) : null;

    const { rows } = await query(
      `
      INSERT INTO sops (title, category, tags, current_html, is_client, client_name, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
      RETURNING id
      `,
      [title, category || 'General', JSON.stringify(safeTags), html, clientFlag, clientName]
    );

    // Optional version record
    if (message || delta) {
      await query(
        `
        INSERT INTO sop_versions (sop_id, version_no, message, delta, created_at)
        VALUES ($1, 1, $2, $3::jsonb, NOW())
        `,
        [rows[0].id, message || 'Initial version', delta ? JSON.stringify(delta) : null]
      );
    }

    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    console.error('POST /sops failed:', e);
    res.status(500).json({ error: 'Failed to create SOP' });
  }
});

/**
 * PUT /sops/:id
 * Body: { title, category, tags[], html, delta?, message?, is_client?, client_name? }
 */
sopsRouter.put('/sops/:id', requireAuthOptional, async (req, res) => {
  try {
    const { title, category, tags, html, delta, message, is_client, client_name } = req.body || {};
    if (!title || !html) return res.status(400).json({ error: 'title and html are required' });

    const safeTags = Array.isArray(tags) ? tags : [];

    const fields = [
      'title = $1',
      'category = $2',
      'tags = $3::jsonb',
      'current_html = $4',
      'updated_at = NOW()'
    ];
    const args = [title, category || 'General', JSON.stringify(safeTags), html];

    // client fields optional in update
    if (typeof is_client === 'boolean') {
      fields.push(`is_client = $${args.length + 1}`);
      args.push(is_client);
      fields.push(`client_name = $${args.length + 1}`);
      args.push(is_client ? (client_name || null) : null);
    }

    args.push(req.params.id);

    await query(
      `UPDATE sops SET ${fields.join(', ')} WHERE id = $${args.length}`,
      args
    );

    // Optional: new version record
    if (message || delta) {
      await query(
        `
        INSERT INTO sop_versions (sop_id, version_no, message, delta, created_at)
        VALUES (
          $1,
          (SELECT COALESCE(MAX(version_no),0)+1 FROM sop_versions WHERE sop_id = $1),
          $2, $3::jsonb, NOW()
        )
        `,
        [req.params.id, message || 'Edited', delta ? JSON.stringify(delta) : null]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /sops/:id failed:', e);
    res.status(500).json({ error: 'Failed to update SOP' });
  }
});

/**
 * DELETE /sops/:id
 * (Gate with admin check in middleware or here if needed)
 */
sopsRouter.delete('/sops/:id', requireAuthOptional, async (req, res) => {
  try {
    await query(`DELETE FROM sops WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /sops/:id failed:', e);
    res.status(500).json({ error: 'Failed to delete SOP' });
  }
});

export { sopsRouter };
