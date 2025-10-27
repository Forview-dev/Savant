const FALLBACK_LOCAL_API = 'http://localhost:4000';

function getApiBaseUrl() {
  const meta = document.querySelector('meta[name="api-base-url"]');
  const raw = meta?.getAttribute('content')?.trim();

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
    // Default to the same-origin Cloudflare Pages Function proxy
    return window.location.origin.replace(/\/$/, '') + '/api';
  }

  return FALLBACK_LOCAL_API;
}

function setStatus(message, isError = false) {
  const el = document.getElementById('create-status');
  if (!el) return;
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    el.classList.remove('is-error');
    return;
  }

  el.textContent = message;
  el.style.display = '';
  el.classList.toggle('is-error', Boolean(isError));
}

async function fetchMe() {
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/me`, { credentials: 'include' });
    if (!res.ok) return { user: null };
    return await res.json();
  } catch (err) {
    console.error('fetchMe failed', err);
    return { user: null };
  }
}

async function logoutUser() {
  const apiBase = getApiBaseUrl();
  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
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
  const roleName = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Viewer';

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

let quill = null;
let quillLoadingPromise = null;
let usingFallbackTextarea = false;

function ensureQuillCss() {
  const href = 'https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css';
  const already = Array.from(document.styleSheets || []).some((ss) => {
    try { return ss.href && ss.href.includes('quill.snow.css'); } catch { return false; }
  }) || !!document.querySelector(`link[rel="stylesheet"][href*="quill.snow.css"]`);
  if (already) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
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

function renderFallbackTextarea() {
  usingFallbackTextarea = true;
  const editorHost = document.getElementById('editor');
  if (!editorHost) return;
  editorHost.classList.remove('quill');
  editorHost.innerHTML = `
    <textarea id="editor-fallback" class="fallback-textarea" style="width:100%; min-height:320px; padding:12px; border:1px solid rgba(226,232,240,0.7); border-radius:12px;"></textarea>
  `;
}

async function initEditor() {
  ensureQuillCss();
  const editorEl = document.getElementById('editor');
  if (!editorEl) {
    console.error('#editor element missing');
    setStatus('Conteneur de l’éditeur introuvable.', true);
    return;
  }

  try {
    await loadQuill();
  } catch (err) {
    console.warn('Failed to load Quill, falling back to textarea.', err);
    setStatus('Éditeur enrichi indisponible. Utilisation d’un textarea simplifié.', true);
    renderFallbackTextarea();
    return;
  }

  if (!window.Quill) {
    console.warn('window.Quill absent after load; using fallback textarea.');
    setStatus('Éditeur enrichi indisponible. Utilisation d’un textarea simplifié.', true);
    renderFallbackTextarea();
    return;
  }

  quill = new window.Quill('#editor', {
    theme: 'snow',
    placeholder: 'Rédigez le contenu du SOP ici…',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'clean'],
      ],
    },
  });
}

function readForm() {
  const title = document.getElementById('sop-title')?.value.trim() || '';
  const category = document.getElementById('sop-category')?.value.trim() || 'General';
  const tags = (document.getElementById('sop-tags')?.value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const message = document.getElementById('sop-message')?.value.trim() || '';
  const isClient = Boolean(document.getElementById('sop-is-client')?.checked);
  const clientNameRaw = document.getElementById('sop-client-name')?.value.trim() || '';
  const clientName = isClient ? clientNameRaw : null;

  let html = '';
  let delta = null;

  if (usingFallbackTextarea) {
    html = document.getElementById('editor-fallback')?.value || '';
  } else if (quill) {
    delta = quill.getContents();
    html = document.querySelector('#editor .ql-editor')?.innerHTML || '';
  }

  return {
    title,
    category,
    tags,
    delta,
    html,
    message,
    is_client: isClient,
    client_name: clientName,
  };
}

function clearForm() {
  document.getElementById('sop-title')?.value = '';
  document.getElementById('sop-category')?.value = '';
  document.getElementById('sop-tags')?.value = '';
  document.getElementById('sop-message')?.value = '';
  const toggle = document.getElementById('sop-is-client');
  if (toggle) toggle.checked = false;
  const clientName = document.getElementById('sop-client-name');
  if (clientName) clientName.value = '';
  syncClientFieldsVisibility();
  if (quill) {
    quill.setContents([]);
  }
  if (usingFallbackTextarea) {
    const fallback = document.getElementById('editor-fallback');
    if (fallback) fallback.value = '';
  }
}

function syncClientFieldsVisibility() {
  const wrapper = document.getElementById('client-name-wrapper');
  const toggle = document.getElementById('sop-is-client');
  if (!wrapper || !toggle) return;
  wrapper.style.display = toggle.checked ? 'flex' : 'none';
}

async function requireAuth() {
  const { user } = await fetchMe();
  if (!user) {
    const target = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    window.location.replace(`/login.html?redirect=${target}`);
    return false;
  }
  if (!(user.role === 'admin' || user.role === 'editor')) {
    alert('Vous n’avez pas la permission de créer un SOP.');
    window.location.replace('/');
    return false;
  }
  renderUserPill(user);
  return true;
}

async function saveSop(event) {
  event?.preventDefault();
  const payload = readForm();

  if (!payload.title) {
    setStatus('Le titre est requis pour sauvegarder le SOP.', true);
    return;
  }
  if (payload.is_client && !payload.client_name) {
    setStatus('Veuillez indiquer le nom du client pour un SOP client.', true);
    return;
  }

  setStatus('Sauvegarde en cours…');
  const apiBase = getApiBaseUrl();

  try {
    const res = await fetch(`${apiBase}/sops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Échec (${res.status})`);
    }

    clearForm();
    setStatus('SOP sauvegardé avec succès. Vous pouvez en créer un autre !');
  } catch (err) {
    console.error('Failed to save SOP', err);
    setStatus(`Impossible de sauvegarder le SOP : ${err.message}`, true);
  }
}

function bindInteractions() {
  document.getElementById('save-sop')?.addEventListener('click', saveSop);
  document.getElementById('clear-editor')?.addEventListener('click', (event) => {
    event.preventDefault();
    clearForm();
    setStatus('Formulaire réinitialisé.');
  });
  document.getElementById('sop-is-client')?.addEventListener('change', (event) => {
    syncClientFieldsVisibility();
    if (!event.target.checked) {
      const statusEl = document.getElementById('create-status');
      if (statusEl?.classList.contains('is-error')) {
        setStatus('');
      }
    }
  });
}

(async function init() {
  if (!(await requireAuth())) return;
  syncClientFieldsVisibility();
  bindInteractions();
  await initEditor();
})();
