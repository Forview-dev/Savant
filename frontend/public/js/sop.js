function getApiBaseUrl() {
  const meta = document.querySelector('meta[name="api-base-url"]');
  return meta?.getAttribute('content') || 'http://localhost:4000';
}

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
  const pill = document.getElementById('user-pill');
  if (pill) pill.textContent = user.email;
  return true;
}

// Robust ID extraction: ?id=123 OR #123 OR #id=123 OR /sop/123
function getSopId() {
  const u = new URL(window.location.href);
  const q = u.searchParams.get('id');
  if (q) return q;

  const hash = (u.hash || '').replace(/^#/, '');
  if (hash) {
    if (hash.startsWith('id=')) return hash.slice(3);
    return hash; // plain "#123"
  }

  const m = u.pathname.match(/\/sop\/([^\/?#]+)/i);
  if (m && m[1]) return decodeURIComponent(m[1]);

  return null;
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

async function renderSop() {
  const container = document.getElementById('sop-detail');
  const id = getSopId();

  if (!id) {
    container.innerHTML = '<p class="muted">No SOP ID provided in URL.</p>';
    return;
  }

  const sop = await fetchSop(id);
  if (!sop) return; // redirected or not found

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
    <h2>${escapeHtml(sop.title)}</h2>
    <p class="muted">
      Category: <strong>${escapeHtml(sop.category || 'Uncategorized')}</strong><br>
      Updated: ${new Date(sop.updated_at).toLocaleString()}
    </p>
    <div>${tags}</div>
    <hr>
    <div class="tile-body">${sop.current_html}</div>
    <hr>
    <h3>Version History</h3>
    <div class="versions">${vRows}</div>
  `;
}

async function init() {
  if (!(await requireAuth())) return;
  await renderSop();

  // Support client-side navigation changes to the hash (e.g., user edits URL)
  window.addEventListener('hashchange', renderSop);
}
init();
