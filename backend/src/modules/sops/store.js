import { pool } from '../../db/pool.js';

function nowIso() {
  return new Date().toISOString();
}

export async function listSops() {
  const { rows } = await pool.query(
    `SELECT id, title, category, tags, author_email, current_delta, current_html, created_at, updated_at, deleted_at
     FROM sops
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC;`
  );
  return rows;
}

/**
 * Filtered list with optional full-text search.
 * @param {Object} opts
 * @param {string=} opts.q
 * @param {string=} opts.category
 * @param {string[]=} opts.tags  // overlap match
 * @param {string=} opts.sort    // 'updated_desc' (default) | 'updated_asc'
 */
export async function listSopsFiltered({ q, category, tags, sort }) {
  const clauses = ['deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  if (q && q.trim()) {
    // Use the precomputed, GIN-indexed tsvector column
    clauses.push(`search_tsv @@ plainto_tsquery('simple', $${idx})`);
    params.push(q.trim());
    idx++;
  }

  if (category && category.trim()) {
    clauses.push(`category ILIKE $${idx}`);
    params.push(category.trim());
    idx++;
  }

  if (Array.isArray(tags) && tags.length > 0) {
    clauses.push(`tags && $${idx}::text[]`);
    params.push(tags);
    idx++;
  }

  const order =
    sort === 'updated_asc' ? 'ORDER BY updated_at ASC' : 'ORDER BY updated_at DESC';

  const sql = `
    SELECT id, title, category, tags, author_email, current_delta, current_html, created_at, updated_at, deleted_at
    FROM sops
    WHERE ${clauses.join(' AND ')}
    ${order};
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getSop(id) {
  const { rows } = await pool.query(
    `SELECT id, title, category, tags, author_email, current_delta, current_html, created_at, updated_at, deleted_at
     FROM sops WHERE id=$1 AND deleted_at IS NULL;`,
    [id]
  );
  return rows[0] || null;
}

export async function createSop({ title, category, tags, delta, html, author_email, message }) {
  const { rows } = await pool.query(
    `INSERT INTO sops (title, category, tags, author_email, current_delta, current_html, plain_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, category, tags, author_email, current_delta, current_html, created_at, updated_at, deleted_at;`,
    [title, category || null, tags || [], author_email, delta, html, stripToText(html)]
  );
  const sop = rows[0];

  await pool.query(
    `INSERT INTO sop_versions (sop_id, version_no, delta, html, author_email, message)
     VALUES ($1, 1, $2, $3, $4, $5);`,
    [sop.id, delta, html, author_email, message || 'Initial version']
  );
  return sop;
}

export async function updateSop(id, { title, category, tags, delta, html, author_email, message }) {
  const { rows } = await pool.query(
    `UPDATE sops
     SET title=COALESCE($2, title),
         category=COALESCE($3, category),
         tags=COALESCE($4, tags),
         current_delta=COALESCE($5, current_delta),
         current_html=COALESCE($6, current_html),
         plain_text=COALESCE($7, plain_text),
         updated_at=NOW()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id, title, category, tags, author_email, current_delta, current_html, created_at, updated_at, deleted_at;`,
    [id, title ?? null, category ?? null, tags ?? null, delta ?? null, html ?? null, html ? stripToText(html) : null]
  );
  const updated = rows[0];
  if (!updated) return null;

  const { rows: ver } = await pool.query(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no FROM sop_versions WHERE sop_id=$1;`,
    [id]
  );
  const nextNo = ver[0].next_no;

  await pool.query(
    `INSERT INTO sop_versions (sop_id, version_no, delta, html, author_email, message)
     VALUES ($1, $2, $3, $4, $5, $6);`,
    [id, nextNo, delta, html, author_email, message || 'Update']
  );

  return updated;
}

export async function softDeleteSop(id) {
  const { rowCount } = await pool.query(
    `UPDATE sops SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL;`,
    [id]
  );
  return rowCount > 0;
}

export async function listVersions(id) {
  const { rows } = await pool.query(
    `SELECT version_no, author_email, message, created_at
     FROM sop_versions
     WHERE sop_id=$1
     ORDER BY version_no DESC;`,
    [id]
  );
  return rows;
}

export async function getVersion(id, version_no) {
  const { rows } = await pool.query(
    `SELECT version_no, delta, html, author_email, message, created_at
     FROM sop_versions
     WHERE sop_id=$1 AND version_no=$2;`,
    [id, version_no]
  );
  return rows[0] || null;
}

export async function restoreVersion(id, version_no, author_email) {
  const v = await getVersion(id, version_no);
  if (!v) return null;

  const { rows } = await pool.query(
    `UPDATE sops
     SET current_delta=$2,
         current_html=$3,
         plain_text=$4,
         updated_at=NOW()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING id, title, category, tags, author_email, current_delta, current_html, created_at, updated_at, deleted_at;`,
    [id, v.delta, v.html, stripToText(v.html)]
  );
  const updated = rows[0];
  if (!updated) return null;

  const { rows: ver } = await pool.query(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_no FROM sop_versions WHERE sop_id=$1;`,
    [id]
  );
  const nextNo = ver[0].next_no;

  await pool.query(
    `INSERT INTO sop_versions (sop_id, version_no, delta, html, author_email, message)
     VALUES ($1, $2, $3, $4, $5, $6);`,
    [id, nextNo, v.delta, v.html, author_email, `Restore from v${version_no}`]
  );

  return updated;
}

// --- helpers ---
function stripToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
