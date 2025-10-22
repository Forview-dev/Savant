
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
let quill = null;
let quillLoadingPromise = null;
let usingFallbackTextarea = false;

function setStatus(msg, isError = false) {
  const el = document.getElementById('edit-status');
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.style.display = '';
  el.style.color = isError ? '#ef4444' : '';
}

async function fetchMe() {
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/me`, { credentials: 'include' });
    if (!res.ok) return { user: null };
    return await res.json();
  } catch (e) {
    console.error('fetchMe failed:', e);
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

  // Show email + colored role in pill
  renderUserPill(user);
  return true;
}

// Support #123, #id=123, and #/123
function getSopIdFromHash() {
  let raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw) return null;
  // accept leading "/"
  if (raw.startsWith('/')) raw = raw.slice(1);
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
  const res = await fetch(`${apiBase}/sops/${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to load SOP ${id} (status ${res.status}) ${text ? '— ' + text : ''}`);
  }
  return res.json();
}

/** If Quill fails to load, render a textarea fallback so editing still works. */
function renderFallbackTextarea(html) {
  usingFallbackTextarea = true;
  const editorHost = document.getElementById('editor');
  if (!editorHost) return;
  editorHost.classList.remove('quill');
  editorHost.innerHTML = `
    <textarea id="editor-fallback" style="width:100%; min-height:320px; padding:12px; border:1px solid rgba(226,232,240,0.7); border-radius:12px;">${(html || '').replace(/<\/?[^>]+(>|$)/g, '')}</textarea>
  `;
}

async function initEditorWithHtml(html) {
  const editorEl = document.getElementById('editor');
  if (!editorEl) {
    console.error('#editor element not found');
    setStatus('Editor container missing in layout.', true);
    return;
  }

  try {
    await loadQuill();
  } catch (e) {
    console.warn('Quill CDN failed, using textarea fallback.', e);
    setStatus('Rich text editor failed to load. Using a basic textarea instead.', true);
    renderFallbackTextarea(html);
    return;
  }

  if (!window.Quill) {
    console.warn('window.Quill not present after load; using textarea fallback.');
    setStatus('Rich text editor unavailable. Using a basic textarea instead.', true);
    renderFallbackTextarea(html);
    return;
  }

  // Initialize Quill
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
  setStatus('');
}

function readForm() {
  const title = document.getElementById('sop-title').value.trim();
  const category = document.getElementById('sop-category').value.trim() || 'General';
  const tags = document.getElementById('sop-tags').value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  let html = '';
  let delta = null;

  if (usingFallbackTextarea) {
    html = document.getElementById('editor-fallback').value;
    // keep delta null (server can ignore or regenerate)
  } else {
    delta = quill.getContents();
    html = document.querySelector('#editor .ql-editor').innerHTML;
  }

  const message = document.getElementById('sop-message').value.trim();
  return { title, category, tags, delta, html, message };
}

async function saveChanges(id) {
  const payload = readForm();
  if (!payload.title) return alert('Title is required.');
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/sops/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Save failed (${res.status})`);
    }
    window.location.href = `/sop.html#${encodeURIComponent(id)}`;
  } catch (e) {
    console.error('Save failed:', e);
    setStatus(e.message || 'Save failed', true);
    alert(`Save failed: ${e.message || e}`);
  }
}

async function loadAndFill(id) {
  setStatus('Loading SOP…');
  const sop = await fetchSop(id);
  // Fill form fields
  document.getElementById('sop-title').value = sop.title || '';
  document.getElementById('sop-category').value = sop.category || '';
  document.getElementById('sop-tags').value = (sop.tags || []).join(', ');
  // Init editor (Quill or fallback)
  await initEditorWithHtml(sop.current_html || '');
  setStatus('');
}

async function init() {
  if (!(await requireAuthEditor())) return;

  const id = getSopIdFromHash();
  if (!id) {
    setStatus('No SOP ID in URL. Use edit.html#<id>.', true);
    document.getElementById('edit-card').style.opacity = '0.6';
    return;
  }

  // Cancel → back to SOP
  document.getElementById('cancel-link').setAttribute('href', `/sop.html#${encodeURIComponent(id)}`);

  try {
    await loadAndFill(id);
  } catch (e) {
    console.error('loadAndFill error:', e);
    setStatus(e.message || 'Failed to load SOP.', true);
  }

  document.getElementById('save-sop').addEventListener('click', async () => {
    await saveChanges(id);
  });

  // react to manual hash changes (switching ids)
  window.addEventListener('hashchange', async () => {
    const newId = getSopIdFromHash();
    if (!newId) return;
    document.getElementById('cancel-link').setAttribute('href', `/sop.html#${encodeURIComponent(newId)}`);
    try {
      await loadAndFill(newId);
    } catch (e) {
      console.error('loadAndFill (hashchange) error:', e);
      setStatus(e.message || 'Failed to load SOP.', true);
    }
  });
}
init();
