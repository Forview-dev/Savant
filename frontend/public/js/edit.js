function getApiBaseUrl() {
  const meta = document.querySelector('meta[name="api-base-url"]');
  return meta?.getAttribute('content') || 'http://localhost:4000';
}

let CURRENT_USER = null;
let quill = null;
let quillLoadingPromise = null;

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

async function requireAuthEditor() {
  const { user } = await fetchMe();
  if (!user) {
    const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    window.location.replace(`/login.html?redirect=${target}`);
    return false;
  }
  const role = user.role;
  if (!(role === 'admin' || role === 'editor')) {
    alert('You do not have permission to edit SOPs.');
    window.location.replace('/');
    return false;
  }
  CURRENT_USER = user;
  const pill = document.getElementById('user-pill');
  if (pill) pill.textContent = user.email;
  return true;
}

// HASH-ONLY: edit.html#<id> or edit.html#id=<id>
function getSopIdFromHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw) return null;
  if (raw.startsWith('id=')) return decodeURIComponent(raw.slice(3));
  return decodeURIComponent(raw);
}

function loadQuill() {
  if (quillLoadingPromise) return quillLoadingPromise;
  if (window.Quill) return Promise.resolve();
  quillLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Quill.js'));
    document.head.appendChild(script);
  });
  return quillLoadingPromise;
}

async function fetchSop(id) {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/sops/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load SOP ${id}`);
  return res.json();
}

async function initEditorWithHtml(html) {
  await loadQuill();
  const editorEl = document.getElementById('editor');
  quill = new window.Quill('#editor', {
    theme: 'snow',
    placeholder: 'Edit SOP content...',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'clean'],
      ],
    },
  });
  editorEl.querySelector('.ql-editor').innerHTML = html || '';
}

function readForm() {
  const title = document.getElementById('sop-title').value.trim();
  const category = document.getElementById('sop-category').value.trim() || 'General';
  const tags = document.getElementById('sop-tags').value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  const delta = quill.getContents();
  const html = document.querySelector('#editor .ql-editor').innerHTML;
  const message = document.getElementById('sop-message').value.trim();
  return { title, category, tags, delta, html, message };
}

async function saveChanges(id) {
  const payload = readForm();
  if (!payload.title) return alert('Title is required.');
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/sops/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(`Save failed: ${data.error || res.status}`);
    return;
  }
  window.location.href = `/sop.html#${encodeURIComponent(id)}`;
}

async function loadAndFill(id) {
  const sop = await fetchSop(id);
  document.getElementById('sop-title').value = sop.title || '';
  document.getElementById('sop-category').value = sop.category || '';
  document.getElementById('sop-tags').value = (sop.tags || []).join(', ');
  await initEditorWithHtml(sop.current_html || '');
}

async function init() {
  if (!(await requireAuthEditor())) return;

  const id = getSopIdFromHash();
  if (!id) {
    document.body.innerHTML = '<main class="container"><div class="card"><p class="muted">No SOP ID in URL. Use edit.html#&lt;id&gt;.</p></div></main>';
    return;
  }

  document.getElementById('cancel-link').setAttribute('href', `/sop.html#${encodeURIComponent(id)}`);

  try {
    await loadAndFill(id);
    document.getElementById('save-sop').addEventListener('click', async () => {
      await saveChanges(id);
    });
  } catch (e) {
    document.body.innerHTML = `<main class="container"><div class="card"><p class="muted">Error: ${e.message || e}</p></div></main>`;
  }

  // react to manual hash changes (switching ids)
  window.addEventListener('hashchange', async () => {
    const newId = getSopIdFromHash();
    if (!newId) return;
    await loadAndFill(newId);
    document.getElementById('cancel-link').setAttribute('href', `/sop.html#${encodeURIComponent(newId)}`);
  });
}
init();
