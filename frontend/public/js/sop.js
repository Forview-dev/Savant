function getApiBaseUrl() {
  const meta = document.querySelector('meta[name="api-base-url"]');
  return meta?.getAttribute('content') || 'http://localhost:4000';
}

let CURRENT_USER = null;

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
  const pill = document.getElementById('user-pill');
  if (pill) pill.textContent = `${user.email}`;
  return true;
}

// HASH-ONLY: sop.html#<id> or sop.html#id=<id>
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
  if (!res.ok) {
    if (res.status === 401) {
      const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.replace(`/login.html?redirect=${target}`);
      return null;
    }
    throw new Error(`SOP ${id} not found`);
  }
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

function renderActions(id) {
  const bar = document.getElementById('sop-actions');
  if (!bar) return;
  const parts = [];

  if (canEdit()) {
    parts.push(`<a class="tile-link" href="/edit.html#${encodeURIComponent(id)}"><button>Edit SOP</button></a>`);
  }
  if (canDelete()) {
    parts.push(`<button id="delete-sop-btn" class="ghost" title="Delete SOP">Delete</button>`);
  }

  if (parts.length) {
    bar.innerHTML = parts.join('');
    bar.style.display = '';
    const delBtn = document.getElementById('delete-sop-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        const ok = confirm('Are you sure you want to delete this SOP?');
        if (!ok) return;
        try {
          const apiBase = getApiBaseUrl();
          const res = await fetch(`${apiBase}/sops/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(`Delete failed: ${data.error || res.status}`);
            return;
          }
          window.location.href = '/';
        } catch (e) {
          alert(`Delete failed: ${e.message || e}`);
        }
      });
    }
  } else {
    bar.style.display = 'none';
  }
}

async function renderSop() {
  const container = document.getElementById('sop-detail');
  const id = getSopIdFromHash();

  if (!id) {
    container.innerHTML = '<p class="muted">No SOP ID provided. Use sop.html#&lt;id&gt;.</p>';
    return;
  }

  // actions first (so buttons are visible while content loads)
  renderActions(id);

  const sop = await fetchSop(id);
  if (!sop) return;

  const versions = await fetchVersions(id);

  const tags = (sop.tags || [])
    .map(t => `<span class="badge">${escapeHtml(t)}</span>`)
    .join('');

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

    <div class="card">
      <div class="tile-body">${sop.current_html}</div>
    </div>

    <div class="card">
      <h3>Version History</h3>
      <div class="versions">${vRows}</div>
    </div>
  `;
}

async function init() {
  if (!(await requireAuth())) return;
  await renderSop();
  // respond to manual hash changes
  window.addEventListener('hashchange', renderSop);
}
init();
