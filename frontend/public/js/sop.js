
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

function formatDate(value) {
  if (!value) return 'Non disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Non disponible';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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

  bar.classList.add('sop-action-bar');

  const actions = [
    `<a href="/" class="sop-action-button ghost sop-back-button">← Retour</a>`,
  ];

  if (canEdit()) {
    actions.push(`<a class="sop-action-button sop-edit-button" href="/edit.html#${encodeURIComponent(id)}">Éditer le SOP</a>`);
  }
  if (canDelete()) {
    actions.push(`<button id="delete-sop-btn" type="button" class="sop-action-button danger sop-delete-button" title="Delete SOP">Supprimer</button>`);
  }

  bar.innerHTML = actions.join('');

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

  const category = sop.category || 'Non classé';
  const typeLabel = sop.is_client ? 'SOP client' : 'SOP interne';
  const updatedText = formatDate(sop.updated_at);

  const heroMetaParts = [
    `Catégorie : <strong>${escapeHtml(category)}</strong>`,
    `Mis à jour : ${escapeHtml(updatedText)}`,
  ];
  if (sop.client_name) {
    heroMetaParts.push(`Client : <strong>${escapeHtml(sop.client_name)}</strong>`);
  }

  const tagsList = (sop.tags || []).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join('');
  const tagsHtml = tagsList ? `<div class="sop-tags">${tagsList}</div>` : '';

  const metadataItems = [
    { label: 'Type', value: typeLabel },
    { label: 'Catégorie', value: category },
    { label: 'Dernière mise à jour', value: updatedText },
  ];
  if (sop.client_name) {
    metadataItems.push({ label: 'Client', value: sop.client_name });
  }

  const metadataHtml = metadataItems
    .map(item => `
      <div class="sop-meta-item">
        <span class="sop-meta-label">${escapeHtml(item.label)}</span>
        <span class="sop-meta-value">${escapeHtml(item.value)}</span>
      </div>
    `)
    .join('');

  const timelineItems = versions
    .map((v, index) => {
      const versionLabel = typeof v.version_no !== 'undefined' ? String(v.version_no) : String(index + 1);
      const timestamp = formatDate(v.created_at);
      const note = escapeHtml(v.message || 'Aucune note pour cette version.');
      return `
        <div class="sop-timeline-item">
          <div class="sop-timeline-dot"></div>
          <div class="sop-timeline-content">
            <div class="sop-timeline-heading">
              <span class="sop-version-label">v${escapeHtml(versionLabel)}</span>
              <span class="sop-version-date">${escapeHtml(timestamp)}</span>
            </div>
            <p>${note}</p>
          </div>
        </div>
      `;
    })
    .join('');

  const timelineHtml = versions.length
    ? `<div class="sop-timeline">${timelineItems}</div>`
    : '<div class="sop-empty-state muted">Aucune version précédente.</div>';

  container.innerHTML = `
    <section class="sop-hero card">
      <span class="sop-hero-badge">${escapeHtml(typeLabel)}</span>
      <h1>${escapeHtml(sop.title)}</h1>
      <p class="sop-hero-meta">${heroMetaParts.map(part => `<span>${part}</span>`).join('')}</p>
      ${tagsHtml}
    </section>

    <div class="sop-layout">
      <article class="sop-content card">
        <div class="sop-content-header">
          <h2>Processus détaillé</h2>
          <p>Suivez chaque étape pour garantir une exécution sans faille.</p>
        </div>
        <div class="sop-content-body">${sop.current_html}</div>
      </article>

      <aside class="sop-sidebar card">
        <h3>Infos clés</h3>
        <div class="sop-meta-grid">${metadataHtml}</div>
      </aside>
    </div>

    <section class="sop-versions card">
      <h3>Historique des versions</h3>
      ${timelineHtml}
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
