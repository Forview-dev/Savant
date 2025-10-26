
function getApiBaseUrl() {
  const meta = document.querySelector('meta[name="api-base-url"]');
  const raw = meta?.getAttribute('content')?.trim();
  const fallbackLocal = 'http://localhost:4000';

  if (raw) {
    try {
      const resolved = new URL(raw, window.location.origin);
      if (window.location.protocol === 'https:' && resolved.protocol === 'http:') {
        resolved.protocol = 'https:';
      }
      return resolved.href.replace(/\/+$/, '');
    } catch (err) {
      console.warn('Invalid api-base-url meta', err);
    }
  }

  if (window.location.protocol === 'https:') {
    return window.location.origin;
  }

  return fallbackLocal;
}

let CURRENT_USER = null;
let PENDING_DELETE_ID = null;

async function fetchMe() {
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/me`, { credentials: 'include' });
    if (!res.ok) return { user: null };
    return await res.json();
  } catch {
    return { user: null };
  }
}

async function logoutUser() {
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      console.warn('Logout failed', res.status);
    }
  } catch (err) {
    console.warn('Logout request failed', err);
  } finally {
    window.location.replace('/login.html');
  }
}

function renderUserPill(user) {
  const pill = document.getElementById('user-pill');
  if (!pill) return;

  const roleClass = `role-${(user.role || 'viewer').toLowerCase()}`;
  const roleName = user.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Viewer';

  const emailSpan = document.createElement('span');
  emailSpan.textContent = user.email || '';

  const roleSpan = document.createElement('span');
  roleSpan.className = `role ${roleClass}`;
  roleSpan.textContent = `(${roleName})`;

  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'logout-button';
  logoutButton.textContent = 'Log out';
  logoutButton.addEventListener('click', (event) => {
    event.preventDefault();
    logoutUser();
  });

  pill.replaceChildren(emailSpan, roleSpan, logoutButton);
}

async function requireAuth() {
  const { user } = await fetchMe();
  if (!user) {
    const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    window.location.replace(`/login.html?redirect=${target}`);
    return false;
  }
  CURRENT_USER = user;

  // Render email + colored role
  renderUserPill(user);

  return true;
}

function getSopIdFromHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw) return null;
  if (raw.startsWith('id=')) return decodeURIComponent(raw.slice(3));
  return decodeURIComponent(raw);
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function fetchSop(id) {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/sops/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`SOP ${id} not found`);
  return res.json();
}

async function fetchVersions(id) {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/sops/${id}/versions`, { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

function canEdit() {
  const role = CURRENT_USER?.role;
  return role === 'admin' || role === 'editor';
}
function canDelete() {
  const role = CURRENT_USER?.role;
  return role === 'admin';
}

/* ---------- Modal helpers ---------- */
function openModal() {
  document.getElementById('modal-backdrop')?.classList.add('show');
}
function closeModal() {
  document.getElementById('modal-backdrop')?.classList.remove('show');
  PENDING_DELETE_ID = null;
}
function bindModalEvents() {
  const backdrop = document.getElementById('modal-backdrop');
  const btnCancel = document.getElementById('modal-cancel');
  const btnConfirm = document.getElementById('modal-confirm');

  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  btnCancel?.addEventListener('click', closeModal);
  btnConfirm?.addEventListener('click', async () => {
    if (!PENDING_DELETE_ID) return;
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/sops/${encodeURIComponent(PENDING_DELETE_ID)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Delete failed: ${data.error || res.status}`);
        return;
      }
      closeModal();
      window.location.href = '/';
    } catch (e) {
      alert(`Delete failed: ${e.message || e}`);
    }
  });
}

function renderActions(id) {
  const bar = document.getElementById('sop-actions');
  if (!bar) return;

  let buttons = `
    <a href="/" class="sop-action sop-action--ghost">
      <span aria-hidden="true">←</span>
      <span>Tableau de bord</span>
    </a>
  `;

  if (canEdit()) {
    buttons += `
      <a class="sop-action sop-action--primary" href="/edit.html#${encodeURIComponent(id)}">
        <span aria-hidden="true">✎</span>
        <span>Éditer</span>
      </a>
    `;
  }
  if (canDelete()) {
    buttons += `
      <button id="delete-sop-btn" class="sop-action sop-action--danger" type="button" title="Supprimer ce SOP">
        <span aria-hidden="true">🗑</span>
        <span>Supprimer</span>
      </button>
    `;
  }

  bar.innerHTML = buttons;

  // Wire delete modal
  document.getElementById('delete-sop-btn')?.addEventListener('click', () => {
    PENDING_DELETE_ID = id;
    openModal();
  });
}

async function renderSop() {
  const container = document.getElementById('sop-detail');
  const titleEl = document.getElementById('sop-title');
  const categoryEl = document.getElementById('sop-category');
  const metaEl = document.getElementById('sop-meta');
  const tagsEl = document.getElementById('sop-tags');
  const id = getSopIdFromHash();
  if (!container || !titleEl || !categoryEl || !metaEl || !tagsEl) return;

  if (!id) {
    titleEl.textContent = 'SOP introuvable';
    categoryEl.textContent = 'Catégorie • —';
    metaEl.innerHTML = '';
    tagsEl.innerHTML = '';
    container.innerHTML = `
      <article class="sop-content card">
        <p class="muted">No SOP ID provided. Utilisez sop.html#&lt;id&gt;.</p>
      </article>
    `;
    return;
  }

  renderActions(id);
  const sop = await fetchSop(id);
  const versions = await fetchVersions(id);
  const updatedAt = sop.updated_at ? new Date(sop.updated_at).toLocaleString() : '—';
  const metaItems = [
    `<div class="sop-meta-item"><span>Mis à jour</span><span>${escapeHtml(updatedAt)}</span></div>`,
    `<div class="sop-meta-item"><span>Identifiant</span><span>#${escapeHtml(sop.id || id)}</span></div>`,
    `<div class="sop-meta-item"><span>Type</span><span>${sop.is_client ? 'Client' : 'Interne'}</span></div>`,
  ];
  if (sop.client_name) {
    metaItems.push(`<div class="sop-meta-item"><span>Client</span><span>${escapeHtml(sop.client_name)}</span></div>`);
  }

  titleEl.textContent = sop.title || 'Sans titre';
  categoryEl.textContent = `Catégorie • ${sop.category || 'Non classé'}`;
  metaEl.innerHTML = metaItems.join('');

  const tagItems = (sop.tags || [])
    .filter(Boolean)
    .map(t => `<span class="badge">${escapeHtml(t)}</span>`);
  tagsEl.innerHTML = tagItems.length
    ? tagItems.join('')
    : '<span class="badge is-empty">Aucun tag</span>';

  const timeline = versions.length
    ? versions.map(v => {
        const createdAt = v.created_at ? new Date(v.created_at).toLocaleString() : '—';
        const message = v.message
          ? escapeHtml(v.message)
          : '<span class="muted">Aucune note</span>';
        return `
          <div class="sop-timeline__item">
            <span class="sop-timeline__marker" aria-hidden="true"></span>
            <span class="sop-timeline__badge">v${escapeHtml(String(v.version_no))}</span>
            <div class="sop-timeline__meta">${escapeHtml(createdAt)}</div>
            <div class="sop-timeline__message">${message}</div>
          </div>
        `;
      }).join('')
    : '<p class="sop-timeline__empty">Pas encore de versions enregistrées.</p>';

  const currentHtml = sop.current_html && sop.current_html.trim()
    ? sop.current_html
    : '<p class="muted">Ce SOP ne contient pas encore de contenu.</p>';

  container.innerHTML = `
    <article class="sop-content card">
      <div class="sop-content__header">
        <span class="sop-content__eyebrow">Procédure détaillée</span>
      </div>
      <article class="sop-richtext">${currentHtml}</article>
    </article>
    <aside class="sop-sidebar card">
      <h3>Historique des versions</h3>
      <div class="sop-timeline">${timeline}</div>
    </aside>
  `;

  document.title = `Savant! — ${sop.title || 'SOP'}`;
}

async function init() {
  if (!(await requireAuth())) return;
  bindModalEvents();
  await renderSop();
  window.addEventListener('hashchange', renderSop);
}
init();
