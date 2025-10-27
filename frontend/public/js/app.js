
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

// Redirect to /login.html if not authenticated
async function requireAuth() {
  const { user } = await fetchMe();
  if (!user) {
    const target = encodeURIComponent(
      window.location.pathname + window.location.search + window.location.hash
    );
    window.location.replace(`/login.html?redirect=${target}`);
    return false;
  }

  // Update the header pill: email + colored role
  renderUserPill(user);
  return true;
}

// ---------------- Views & Nav ----------------
async function showView(view) {
  const sections = {
    sops: document.getElementById('view-sops'),
    'client-sops': document.getElementById('view-client-sops'),
  };

  Object.entries(sections).forEach(([key, el]) => {
    if (!el) return;
    el.style.display = view === key ? '' : 'none';
  });

  if (view === 'sops') {
    await reloadSops();
    return;
  }

  if (view === 'client-sops') {
    await reloadClientSops();
  }
}

function wireNav() {
  const navLinks = document.querySelectorAll('.nav .nav-link[href="#"]');
  const createButton = document.getElementById('create-sop-button');

  const setActive = (view) => {
    navLinks.forEach((link) => {
      const target = link.getAttribute('data-view');
      link.classList.toggle('active', target === view);
    });
  };

  navLinks.forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      if (!view) return;
      if (!(await requireAuth())) return;
      setActive(view);
      await showView(view);
    });
  });

  if (createButton) {
    createButton.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!(await requireAuth())) return;
      window.location.href = '/write.html';
    });
  }

  setActive('sops');
}

// ---------------- Filters ----------------
function currentFilters() {
  const q = document.getElementById('filter-q').value.trim();
  const category = document.getElementById('filter-category').value.trim();
  const tags = document.getElementById('filter-tags').value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return { q, category, tags };
}
function buildQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      const trimmed = value
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => v !== '' && v !== null && v !== undefined);
      if (!trimmed.length) return;
      qs.set(key, trimmed.join(','));
      return;
    }
    const val = typeof value === 'string' ? value.trim() : value;
    if (val === '') return;
    qs.set(key, val);
  });
  return qs.toString();
}
function setCategoryFilter(value) { document.getElementById('filter-category').value = value; }
function setTagFilter(value) { document.getElementById('filter-tags').value = value; }
function applyFilters() { return reloadSops(); }

function currentClientFilters() {
  const q = document.getElementById('client-filter-q')?.value.trim() || '';
  const clientName = document.getElementById('client-filter-name')?.value.trim() || '';
  return { q, client_name: clientName };
}
function applyClientFilters() { return reloadClientSops(); }

// ---------------- Tiles ----------------
function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function tileHtml(s) {
  const id = String(s.id);
  const updated = new Date(s.updated_at).toLocaleString();
  const cat = s.category || 'Uncategorized';
  const catChip = `<button type="button" class="chip" data-filter-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
  const tags = (s.tags || []).map((t) =>
    `<button type="button" class="chip" data-filter-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join('');
  const clientBadge = s.is_client
    ? `<div class="tile-client">Client: ${escapeHtml(s.client_name || 'Unassigned')}</div>`
    : '';

  // HASH-ONLY routing
  const link = `/sop.html#${encodeURIComponent(id)}`;

  return `
    <div class="tile" data-id="${id}">
      <div class="tile-title">
        <a class="tile-link" href="${link}" style="text-decoration:none; color:inherit;">
          ${escapeHtml(s.title)}
        </a>
      </div>
      <div class="tile-meta">Mis à jour: ${updated}</div>
      ${clientBadge}
      <div class="tile-tags">
        ${catChip}
        ${tags}
      </div>
    </div>
  `;
}

function attachTileInteractions(tileGrid, { enableCategoryFilters = true, enableTagFilters = true } = {}) {
  if (!tileGrid) return;
  tileGrid.onclick = async (e) => {
    const target = e.target;

    const anchor = target.closest?.('a.tile-link');
    if (anchor) return;

    const categoryEl = target.closest?.('[data-filter-category]');
    if (categoryEl) {
      if (!enableCategoryFilters) {
        e.preventDefault?.();
        return;
      }
      const catVal = categoryEl.getAttribute('data-filter-category');
      if (catVal) {
        e.preventDefault?.();
        setCategoryFilter(catVal);
        await applyFilters();
      }
      return;
    }

    const tagEl = target.closest?.('[data-filter-tag]');
    if (tagEl) {
      if (!enableTagFilters) {
        e.preventDefault?.();
        return;
      }
      const tagVal = tagEl.getAttribute('data-filter-tag');
      if (tagVal) {
        e.preventDefault?.();
        setTagFilter(tagVal);
        await applyFilters();
      }
      return;
    }

    const tile = target.closest?.('.tile');
    if (tile) {
      const id = tile.getAttribute('data-id');
      if (!id) return console.warn('Tile has no data-id');
      window.location.href = `/sop.html#${encodeURIComponent(id)}`;
    }
  };
}

async function reloadSops() {
  const apiBase = getApiBaseUrl();
  const tileGrid = document.getElementById('sop-tiles');
  if (tileGrid) tileGrid.innerHTML = 'Loading...';

  const filters = currentFilters();
  filters.client = '0';

  const qs = buildQuery(filters);
  const url = `${apiBase}/sops${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401) {
      const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.replace(`/login.html?redirect=${target}`);
      return;
    }
    if (tileGrid) tileGrid.innerHTML = 'Failed to load SOPs.';
    return;
  }
  const data = await res.json();
  const items = data.items || [];

  if (tileGrid) {
    tileGrid.innerHTML = items.map(tileHtml).join('') || '<p class="muted">No SOPs yet.</p>';
    attachTileInteractions(tileGrid, { enableCategoryFilters: true, enableTagFilters: true });
  }
}

async function reloadClientSops() {
  const apiBase = getApiBaseUrl();
  const tileGrid = document.getElementById('client-sop-tiles');
  if (tileGrid) tileGrid.innerHTML = 'Loading...';

  const filters = currentClientFilters();
  filters.client = '1';

  const qs = buildQuery(filters);
  const url = `${apiBase}/sops${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401) {
      const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.replace(`/login.html?redirect=${target}`);
      return;
    }
    if (tileGrid) tileGrid.innerHTML = 'Failed to load client SOPs.';
    return;
  }
  const data = await res.json();
  const items = data.items || [];

  if (tileGrid) {
    tileGrid.innerHTML = items.map(tileHtml).join('') || '<p class="muted">Il n\'y a pas de SOP client pour le moment.</p>';
    attachTileInteractions(tileGrid, { enableCategoryFilters: false, enableTagFilters: false });
  }
}

// ---------------- Init ----------------
async function init() {
  if (!(await requireAuth())) return;
  wireNav();
  await showView('sops');
}
init();
