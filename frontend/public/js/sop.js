
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

  const buttons = [];

  buttons.push(`
    <a class="sop-action-link" href="/">
      <button class="ghost" id="back-dashboard" title="Retour au tableau de bord">←</button>
    </a>
  `);

  if (canEdit()) {
    buttons.push(`
      <a class="sop-action-link" href="/edit.html#${encodeURIComponent(id)}">
        <button>Modifier le SOP</button>
      </a>
    `);
  }

  if (canDelete()) {
    buttons.push(`
      <button id="delete-sop-btn" class="danger" title="Supprimer ce SOP">Supprimer</button>
    `);
  }

  bar.innerHTML = `<div class="sop-actions__inner">${buttons.join('')}</div>`;

  // Wire delete modal
  document.getElementById('delete-sop-btn')?.addEventListener('click', () => {
    PENDING_DELETE_ID = id;
    openModal();
  });
}

async function renderSop() {
  const container = document.getElementById('sop-detail');
  const id = getSopIdFromHash();
  if (!id) {
    container.innerHTML = '<p class="muted">No SOP ID provided. Use sop.html#&lt;id&gt;.</p>';
    return;
  }

  renderActions(id);
  const sop = await fetchSop(id);
  const versions = await fetchVersions(id);

  const lastUpdated = sop.updated_at ? new Date(sop.updated_at).toLocaleString() : 'Date inconnue';
  const category = sop.category ? escapeHtml(sop.category) : 'Non catégorisé';

  const tags = (sop.tags || []).length
    ? (sop.tags || []).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join('')
    : '<span class="badge badge-muted">Aucun tag</span>';

  const vRows = versions.length
    ? versions.map(v => `
        <li class="timeline-item">
          <div class="timeline-marker"></div>
          <div class="timeline-content">
            <div class="timeline-title">Version ${escapeHtml(`v${v.version_no}`)}</div>
            <div class="timeline-meta">${new Date(v.created_at).toLocaleString()}</div>
            ${v.message ? `<p class="timeline-description">${escapeHtml(v.message)}</p>` : ''}
          </div>
        </li>
      `).join('')
    : '<li class="timeline-empty muted">Aucune version précédente.</li>';

  container.innerHTML = `
    <section class="card sop-hero">
      <div class="sop-hero__eyebrow">Procédure opérationnelle standard</div>
      <h1 class="sop-hero__title">${escapeHtml(sop.title)}</h1>
      <div class="sop-hero__meta">
        <span class="sop-meta-chip"><span class="label">Catégorie</span>${category}</span>
        <span class="sop-meta-chip"><span class="label">Dernière mise à jour</span>${lastUpdated}</span>
      </div>
      <div class="sop-hero__tags">${tags}</div>
    </section>

    <section class="card sop-body">
      <div class="sop-content rich-content">${sop.current_html || '<p class="muted">Aucun contenu disponible.</p>'}</div>
    </section>

    <section class="card sop-versions">
      <div class="section-heading">
        <h2>Historique des versions</h2>
        <p class="muted">Gardez une trace des améliorations clés apportées à ce SOP.</p>
      </div>
      <ol class="version-timeline">${vRows}</ol>
    </section>
  `;
}

async function init() {
  if (!(await requireAuth())) return;
  bindModalEvents();
  await renderSop();
  window.addEventListener('hashchange', renderSop);
}
init();
