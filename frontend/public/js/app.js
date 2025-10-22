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
  document.getElementById('view-sops').style.display = view === 'sops' ? '' : 'none';
  document.getElementById('view-create').style.display = view === 'create' ? '' : 'none';
  if (view === 'create') {
    await ensureQuill(); // lazy-load Quill before initializing editor
  }
}

function wireNav() {
  const links = document.querySelectorAll('.nav-link[href="#"]');
  links.forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = a.getAttribute('data-view');
      if (!(await requireAuth())) return;
      document.querySelectorAll('.nav-link').forEach((x) => x.classList.toggle('active', x === a));
      await showView(view);
      if (view === 'sops') reloadSops();
    });
  });
  // default view
  showView('sops');
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
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.tags && params.tags.length) qs.set('tags', params.tags.join(','));
  return qs.toString();
}
function setCategoryFilter(value) { document.getElementById('filter-category').value = value; }
function setTagFilter(value) { document.getElementById('filter-tags').value = value; }
function applyFilters() { return reloadSops(); }

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
      <div class="tile-tags">
        ${catChip}
        ${tags}
      </div>
    </div>
  `;
}

async function reloadSops() {
  const apiBase = getApiBaseUrl();
  const tileGrid = document.getElementById('sop-tiles');
  if (tileGrid) tileGrid.innerHTML = 'Loading...';

  const filters = currentFilters();
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

    tileGrid.onclick = async (e) => {
      const target = e.target;

      // Let anchors navigate normally (hash link)
      const anchor = target.closest?.('a.tile-link');
      if (anchor) return;

      // Category chip → filter
      const catVal = target.getAttribute?.('data-filter-category');
      if (catVal) { e.preventDefault(); setCategoryFilter(catVal); await applyFilters(); return; }

      // Tag chip → filter
      const tagVal = target.getAttribute?.('data-filter-tag');
      if (tagVal) { e.preventDefault(); setTagFilter(tagVal); await applyFilters(); return; }

      // Fallback: click anywhere on tile navigates
      const tile = target.closest?.('.tile');
      if (tile) {
        const id = tile.getAttribute('data-id');
        if (!id) return console.warn('Tile has no data-id');
        window.location.href = `/sop.html#${encodeURIComponent(id)}`;
      }
    };
  }
}

// ---------------- Create Page (Quill) ----------------
let quill = null;
let quillLoadingPromise = null;

function loadQuillAssets() {
  if (quillLoadingPromise) return quillLoadingPromise;
  quillLoadingPromise = new Promise((resolve, reject) => {
    if (window.Quill) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Quill.js'));
    document.head.appendChild(script);
  });
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
  return { title, category, tags, delta, html, message };
}
function clearCreateForm() {
  document.getElementById('sop-title').value = '';
  document.getElementById('sop-category').value = '';
  document.getElementById('sop-tags').value = '';
  document.getElementById('sop-message').value = '';
  quill.setContents([]);
}
async function saveSop() {
  const apiBase = getApiBaseUrl();
  const payload = readCreateForm();
  if (!payload.title) return alert('Title is required.');
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
  await reloadSops();
}
init();
