
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

async function requireAuth() {
  const { user } = await fetchMe();
  if (!user) {
    const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    window.location.replace(`/login.html?redirect=${target}`);
    return false;
  }
  CURRENT_USER = user;

  // Render email + colored role
  const pill = document.getElementById('user-pill');
  if (pill) {
    const roleClass = `role-${(user.role || 'viewer').toLowerCase()}`;
    const roleName = user.role
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
      : 'Viewer';
    pill.innerHTML = `
      ${user.email}
      <span class="role ${roleClass}">(${roleName})</span>
    `;
  }

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
    <a href="/"><button class="ghost" id="back-dashboard">← Back to Dashboard</button></a>
  `;

  if (canEdit()) {
    buttons += `<a class="tile-link" href="/edit.html#${encodeURIComponent(id)}"><button>Edit SOP</button></a>`;
  }
  if (canDelete()) {
    buttons += `<button id="delete-sop-btn" class="danger" title="Delete SOP">Delete</button>`;
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
  const id = getSopIdFromHash();
  if (!id) {
    container.innerHTML = '<p class="muted">No SOP ID provided. Use sop.html#&lt;id&gt;.</p>';
    return;
  }

  renderActions(id);
  const sop = await fetchSop(id);
  const versions = await fetchVersions(id);

  const tags = (sop.tags || []).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join('');
  const vRows = versions.map(v => `
    <div class="version-row">
      <div>v${v.version_no} • ${new Date(v.created_at).toLocaleString()}</div>
      <div>${escapeHtml(v.message || '')}</div>
    </div>
  `).join('') || '<p class="muted">No previous versions.</p>';

  container.innerHTML = `
    <div class="card">
      <h2>${escapeHtml(sop.title)}</h2>
      <p class="muted">
        Category: <strong>${escapeHtml(sop.category || 'Uncategorized')}</strong><br>
        Updated: ${new Date(sop.updated_at).toLocaleString()}
      </p>
      <div>${tags}</div>
    </div>

    <div class="card"><div class="tile-body">${sop.current_html}</div></div>

    <div class="card">
      <h3>Version History</h3>
      <div class="versions">${vRows}</div>
    </div>
  `;
}

async function init() {
  if (!(await requireAuth())) return;
  bindModalEvents();
  await renderSop();
  window.addEventListener('hashchange', renderSop);
}
init();
