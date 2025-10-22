
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

function getRedirectTarget() {
  const u = new URL(window.location.href);
  // preserve where the user was trying to go
  return u.searchParams.get('redirect') || '/';
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

function startLoginPolling() {
  const started = Date.now();
  const maxMs = 2 * 60 * 1000;
  const msg = document.getElementById('login-msg');

  async function tick() {
    const { user } = await fetchMe();
    if (user) {
      if (msg) msg.textContent = 'Signed in. Redirecting…';
      window.location.replace(getRedirectTarget());
      return;
    }
    if (Date.now() - started > maxMs) {
      if (msg) msg.textContent = 'Magic link expired or not used yet. Try again.';
      clearInterval(timer);
    }
  }

  tick();
  const timer = setInterval(tick, 1500);
}

async function init() {
  // If already signed in, bounce to target
  const { user } = await fetchMe();
  if (user) {
    window.location.replace(getRedirectTarget());
    return;
  }

  const form = document.getElementById('login-form');
  const btn = document.getElementById('login-btn');
  const msg = document.getElementById('login-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const apiBase = getApiBaseUrl();
    const email = document.getElementById('email').value.trim();
    if (!email) return;

    btn.disabled = true;
    if (msg) msg.textContent = 'Sending link… (see backend console in dev)';
    try {
      const res = await fetch(`${apiBase}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (msg) msg.textContent = `Link sent to ${email}. After you click it, you’ll be redirected automatically.`;
      startLoginPolling();
    } catch (err) {
      if (msg) msg.textContent = `Error: ${err.message || err}`;
    } finally {
      btn.disabled = false;
    }
  });
}

init();
