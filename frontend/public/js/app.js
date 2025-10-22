
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

// ---------------- Views & Nav ----------------
async function showView(view) {
  const sections = {
    sops: document.getElementById('view-sops'),
    'client-sops': document.getElementById('view-client-sops'),
    create: document.getElementById('view-create'),
  };

  Object.entries(sections).forEach(([key, el]) => {
    if (!el) return;
    el.style.display = view === key ? '' : 'none';
  });

  if (view === 'create') {
    await ensureQuill(); // lazy-load Quill before initializing editor
    return;
  }

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
  const createView = createButton?.getAttribute('data-view') || 'create';

  const setActive = (view) => {
    navLinks.forEach((link) => {
      const target = link.getAttribute('data-view');
      link.classList.toggle('active', target === view);
    });
    if (createButton) {
      createButton.classList.toggle('active', view === createView);
    }
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
      setActive(createView);
      await showView(createView);
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
      <div class="tile-meta">Updated ${updated}</div>
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
    tileGrid.innerHTML = items.map(tileHtml).join('') || '<p class="muted">No client SOPs yet.</p>';
    attachTileInteractions(tileGrid, { enableCategoryFilters: false, enableTagFilters: false });
  }
}

// ---------------- Create Page (Quill) ----------------
let quill = null;
let quillLoadingPromise = null;

function ensureStylesheet(href, attrName) {
  return new Promise((resolve, reject) => {
    let link = document.querySelector(`link[${attrName}="${href}"]`);
    if (link) {
      if (link.sheet) return resolve();
      link.addEventListener('load', () => resolve(), { once: true });
      link.addEventListener('error', () => reject(new Error(`Failed to load stylesheet: ${href}`)), { once: true });
      return;
    }

    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(attrName, href);
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => reject(new Error(`Failed to load stylesheet: ${href}`)), { once: true });
    document.head.appendChild(link);
  });
}

function loadQuillAssets() {
  if (quillLoadingPromise) return quillLoadingPromise;
  const cssHref = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css';
  const jsSrc = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js';

  quillLoadingPromise = Promise.all([
    ensureStylesheet(cssHref, 'data-quill-css'),
    new Promise((resolve, reject) => {
      if (window.Quill) return resolve();
      const script = document.createElement('script');
      script.src = jsSrc;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Quill.js'));
      document.head.appendChild(script);
    }),
  ]);

  return quillLoadingPromise;
}

async function ensureQuill() {
  if (quill) return;
  await loadQuillAssets();
  if (!window.Quill) {
    alert('Quill failed to load. Check your network and CSP settings.');
    return;
  }
  const editorEl = document.getElementById('editor');
  if (!editorEl) return;

  quill = new window.Quill('#editor', {
    theme: 'snow',
    placeholder: 'Write the SOP content here...',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'clean'],
      ],
    },
  });

  const save = document.getElementById('save-sop');
  const clear = document.getElementById('clear-editor');
  if (save) save.addEventListener('click', saveSop);
  if (clear) clear.addEventListener('click', (e) => { e.preventDefault(); clearCreateForm(); });
}

function readCreateForm() {
  const title = document.getElementById('sop-title').value.trim();
  const category = document.getElementById('sop-category').value.trim() || 'General';
  const tags = document.getElementById('sop-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
  const delta = quill.getContents();
  const html = document.querySelector('#editor .ql-editor').innerHTML;
  const message = document.getElementById('sop-message').value.trim();
  const isClient = !!document.getElementById('sop-is-client')?.checked;
  const clientNameRaw = document.getElementById('sop-client-name')?.value.trim() || '';
  const clientName = isClient ? clientNameRaw : null;
  return { title, category, tags, delta, html, message, is_client: isClient, client_name: clientName };
}
function clearCreateForm() {
  document.getElementById('sop-title').value = '';
  document.getElementById('sop-category').value = '';
  document.getElementById('sop-tags').value = '';
  document.getElementById('sop-message').value = '';
  const clientToggle = document.getElementById('sop-is-client');
  const clientName = document.getElementById('sop-client-name');
  if (clientToggle) clientToggle.checked = false;
  if (clientName) clientName.value = '';
  syncClientFieldsVisibility();
  if (quill) quill.setContents([]);
}
function syncClientFieldsVisibility() {
  const wrapper = document.getElementById('client-name-wrapper');
  const toggle = document.getElementById('sop-is-client');
  if (!wrapper || !toggle) return;
  wrapper.style.display = toggle.checked ? 'flex' : 'none';
}
async function saveSop() {
  const apiBase = getApiBaseUrl();
  const payload = readCreateForm();
  if (!payload.title) return alert('Title is required.');
  if (payload.is_client && !payload.client_name) return alert('Client name is required for client-specific SOPs.');
  const res = await fetch(`${apiBase}/sops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 401) {
      const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.replace(`/login.html?redirect=${target}`);
      return;
    }
    const data = await res.json().catch(() => ({}));
    return alert(`Save failed: ${data.error || res.status}`);
  }
  clearCreateForm();
  document.querySelector('.nav .nav-link[data-view="sops"]')?.click();
}

// ---------------- Init ----------------
async function init() {
  if (!(await requireAuth())) return;
  wireNav();
  const clientToggle = document.getElementById('sop-is-client');
  if (clientToggle) {
    clientToggle.addEventListener('change', syncClientFieldsVisibility);
    syncClientFieldsVisibility();
  }
  await showView('sops');
}
init();
