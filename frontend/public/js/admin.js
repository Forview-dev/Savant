const ADMIN_PATH = '/admin.html';
const TAB_KEYS = ['active', 'used', 'expired'];
const ITEMS_PER_PAGE = 8;
const TAB_TITLES = {
  active: 'Valid links',
  used: 'Used links',
  expired: 'Expired links',
};
const TAB_EMPTY_LABEL = {
  active: 'valid',
  used: 'used',
  expired: 'expired',
};

const tokenState = {
  entries: [],
  buckets: {
    active: [],
    used: [],
    expired: [],
  },
  pages: {
    active: 1,
    used: 1,
    expired: 1,
  },
  currentTab: 'active',
};

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
    window.location.replace(`/login.html?redirect=${encodeURIComponent(ADMIN_PATH)}`);
  }
}

function setAdminLinkVisibility(user) {
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  document.querySelectorAll('[data-admin-link]').forEach((link) => {
    if (isAdmin) {
      link.hidden = false;
      link.removeAttribute('aria-hidden');
    } else {
      link.hidden = true;
      link.setAttribute('aria-hidden', 'true');
    }
  });
}

function renderUserPill(user) {
  const pill = document.getElementById('user-pill');
  if (!pill) return;

  setAdminLinkVisibility(user);

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

function redirectToLogin() {
  const target = encodeURIComponent(ADMIN_PATH);
  window.location.replace(`/login.html?redirect=${target}`);
}

function markAccessDenied(user) {
  const error = document.getElementById('token-error');
  if (error) {
    error.textContent = user
      ? 'Admin role required. Ask an administrator to grant you access.'
      : 'Please sign in as an administrator to view this dashboard.';
    error.hidden = false;
  }
  const table = document.querySelector('.token-table');
  if (table) {
    table.classList.add('is-disabled');
  }
  const refresh = document.getElementById('refresh-button');
  if (refresh) {
    refresh.disabled = true;
  }
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.disabled = true;
    tab.setAttribute('aria-disabled', 'true');
  });
  document.querySelectorAll('.token-page-button').forEach((button) => {
    button.disabled = true;
  });
  setTableEmptyState(true, 'Access restricted.');
}

async function requireAdmin() {
  const { user } = await fetchMe();
  if (!user) {
    markAccessDenied(null);
    redirectToLogin();
    return null;
  }

  renderUserPill(user);

  if ((user.role || '').toLowerCase() !== 'admin') {
    markAccessDenied(user);
    return null;
  }

  return user;
}

function showError(message) {
  const error = document.getElementById('token-error');
  if (!error) return;
  if (message) {
    error.textContent = message;
    error.hidden = false;
  } else {
    error.hidden = true;
    error.textContent = '';
  }
}

function setTableEmptyState(isEmpty, message) {
  const table = document.querySelector('.token-table');
  const empty = document.getElementById('token-empty');
  if (table) {
    table.classList.toggle('is-empty', isEmpty);
  }
  if (empty) {
    if (isEmpty && message) {
      empty.textContent = message;
    }
    empty.hidden = !isEmpty;
  }
}

function formatRelative(date) {
  if (!date) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff >= 0 ? 'just now' : 'in moments';
  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return diff >= 0 ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff >= 0 ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `${days}d ago` : `in ${days}d`;
}

function formatTimeUntil(date) {
  if (!date) return '';
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'now';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'seconds';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) {
    return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days < 7) {
    return remHours ? `${days}d ${remHours}h` : `${days}d`;
  }
  const weeks = Math.floor(days / 7);
  const remDays = days % 7;
  return remDays ? `${weeks}w ${remDays}d` : `${weeks}w`;
}

function formatTimestamp(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleString()} · ${formatRelative(date)}`;
  } catch {
    return String(value);
  }
}

function deriveStatus(item) {
  const now = Date.now();
  const expires = item.expiresAt ? new Date(item.expiresAt) : null;
  if (item.usedAt) {
    const usedDate = new Date(item.usedAt);
    return {
      code: 'used',
      label: `Used ${formatRelative(usedDate)}`,
    };
  }
  if (expires && expires.getTime() <= now) {
    return {
      code: 'expired',
      label: `Expired ${formatRelative(expires)}`,
    };
  }
  if (expires) {
    return {
      code: 'active',
      label: `Active · expires in ${formatTimeUntil(expires)}`,
    };
  }
  return { code: 'active', label: 'Active' };
}

function createLinkButton(url) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'token-link';
  button.dataset.copyLink = url;
  button.textContent = url;
  return button;
}

function clearTokenRows() {
  const tbody = document.getElementById('token-table-body');
  if (tbody) {
    tbody.textContent = '';
  }
}

function renderTokenRows(entries) {
  const tbody = document.getElementById('token-table-body');
  if (!tbody) return;
  tbody.textContent = '';

  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  const template = document.getElementById('token-row-template');
  if (!template) return;

  const frag = document.createDocumentFragment();

  entries.forEach((entry) => {
    const clone = template.content.firstElementChild.cloneNode(true);
    const emailCell = clone.querySelector('[data-key="email"]');
    const linkCell = clone.querySelector('[data-key="verifyUrl"]');
    const createdCell = clone.querySelector('[data-key="createdAt"]');
    const statusCell = clone.querySelector('[data-key="status"]');

    if (emailCell) {
      emailCell.textContent = entry.email || '';
    }
    if (linkCell) {
      linkCell.textContent = '';
      if (entry.verifyUrl) {
        linkCell.appendChild(createLinkButton(entry.verifyUrl));
      }
    }
    if (createdCell) {
      createdCell.textContent = formatTimestamp(entry.createdAt);
    }
    if (statusCell) {
      const status = entry.status || deriveStatus(entry);
      const badge = document.createElement('span');
      badge.className = `token-status-badge token-status-${status.code}`;
      badge.textContent = status.label;
      statusCell.textContent = '';
      statusCell.appendChild(badge);
    }

    frag.appendChild(clone);
  });

  tbody.appendChild(frag);
}

function getEmptyMessage(status) {
  const label = TAB_EMPTY_LABEL[status] || 'magic';
  return `No ${label} magic links yet.`;
}

function getPageDetails(status) {
  const bucket = tokenState.buckets[status] || [];
  const totalItems = bucket.length;
  if (totalItems === 0) {
    tokenState.pages[status] = 1;
    return { items: [], page: 0, totalPages: 0, totalItems };
  }

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  let page = tokenState.pages[status] || 1;
  if (page > totalPages) {
    page = totalPages;
  }
  if (page < 1) {
    page = 1;
  }
  tokenState.pages[status] = page;

  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const items = bucket.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  return { items, page, totalPages, totalItems };
}

function updatePaginationDisplay(status, details) {
  const prev = document.getElementById('token-prev');
  const next = document.getElementById('token-next');
  const indicator = document.getElementById('token-page-indicator');
  const hasPages = details.totalItems > 0 && details.totalPages > 0;

  if (prev) {
    prev.disabled = !hasPages || details.page <= 1;
    prev.setAttribute('aria-disabled', prev.disabled ? 'true' : 'false');
  }
  if (next) {
    next.disabled = !hasPages || details.page >= details.totalPages;
    next.setAttribute('aria-disabled', next.disabled ? 'true' : 'false');
  }
  if (indicator) {
    if (!hasPages) {
      const label = TAB_EMPTY_LABEL[status] || 'magic';
      indicator.textContent = `No ${label} links yet`;
    } else {
      indicator.textContent = `Page ${details.page} of ${details.totalPages} · ${details.totalItems} total`;
    }
  }
}

function renderCurrentView() {
  if (!TAB_KEYS.includes(tokenState.currentTab)) {
    tokenState.currentTab = 'active';
  }

  const details = getPageDetails(tokenState.currentTab);
  if (details.totalItems === 0) {
    clearTokenRows();
    setTableEmptyState(true, getEmptyMessage(tokenState.currentTab));
  } else {
    setTableEmptyState(false);
    renderTokenRows(details.items);
  }
  updatePaginationDisplay(tokenState.currentTab, details);
}

function renderTabs() {
  document.querySelectorAll('.admin-tab').forEach((button) => {
    const key = button.dataset.tab;
    const bucket = tokenState.buckets[key] || [];
    const countEl = button.querySelector('.admin-tab__count');
    if (countEl) {
      countEl.textContent = bucket.length;
      countEl.setAttribute('aria-label', `${TAB_TITLES[key] || 'Links'} count: ${bucket.length}`);
    }
    const isActive = key === tokenState.currentTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    if (button.disabled) {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
    }
  });
}

function normalizeTokenEntries(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      ...item,
      status: deriveStatus(item),
    }))
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
}

function applyTokenData(items) {
  tokenState.entries = normalizeTokenEntries(items);
  const buckets = {
    active: [],
    used: [],
    expired: [],
  };

  tokenState.entries.forEach((entry) => {
    const key = TAB_KEYS.includes(entry.status.code) ? entry.status.code : 'active';
    buckets[key].push(entry);
  });

  tokenState.buckets = buckets;
  tokenState.pages = {
    active: 1,
    used: 1,
    expired: 1,
  };

  renderTabs();
  renderCurrentView();
}

async function loadTokens() {
  const refresh = document.getElementById('refresh-button');
  if (refresh) refresh.disabled = true;
  showError('');
  const apiBase = getApiBaseUrl();
  try {
    const res = await fetch(`${apiBase}/auth/magic-links`, { credentials: 'include' });
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    if (res.status === 403) {
      markAccessDenied({ role: 'forbidden' });
      return;
    }
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    const data = await res.json();
    applyTokenData(data.items || []);
  } catch (err) {
    console.error('Failed to load magic link requests', err);
    showError('Unable to load magic link requests. Try refreshing in a moment.');
  } finally {
    if (refresh) refresh.disabled = false;
  }
}

function changePage(delta) {
  const status = TAB_KEYS.includes(tokenState.currentTab) ? tokenState.currentTab : 'active';
  const bucket = tokenState.buckets[status] || [];
  if (bucket.length === 0) {
    tokenState.pages[status] = 1;
    return;
  }

  const totalPages = Math.ceil(bucket.length / ITEMS_PER_PAGE);
  let page = tokenState.pages[status] || 1;
  page += delta;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  tokenState.pages[status] = page;
  renderCurrentView();
}

function setupTabs() {
  const tablist = document.querySelector('.admin-tabs');
  if (!tablist) return;

  tablist.addEventListener('click', (event) => {
    const button = event.target.closest('.admin-tab');
    if (!button || button.disabled) return;
    const tab = button.dataset.tab;
    if (!tab) return;
    event.preventDefault();
    const key = TAB_KEYS.includes(tab) ? tab : 'active';
    if (tokenState.currentTab === key) return;
    tokenState.currentTab = key;
    renderTabs();
    renderCurrentView();
  });
}

function setupPagination() {
  const prev = document.getElementById('token-prev');
  const next = document.getElementById('token-next');

  if (prev) {
    prev.addEventListener('click', (event) => {
      event.preventDefault();
      changePage(-1);
    });
  }

  if (next) {
    next.addEventListener('click', (event) => {
      event.preventDefault();
      changePage(1);
    });
  }
}

function setupCopyHandler() {
  const tbody = document.getElementById('token-table-body');
  if (!tbody) return;

  tbody.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-copy-link]');
    if (!target) return;
    event.preventDefault();
    const link = target.dataset.copyLink;
    if (!link) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = link;
        tempInput.setAttribute('readonly', '');
        tempInput.style.position = 'absolute';
        tempInput.style.left = '-9999px';
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      markCopied(target);
    } catch (err) {
      console.warn('Clipboard copy failed', err);
      showError('Copy failed. You can still select and copy the link manually.');
    }
  });
}

function markCopied(element) {
  element.setAttribute('data-copied', 'true');
  const timeoutId = Number(element.dataset.copyTimeoutId);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }
  const id = window.setTimeout(() => {
    element.removeAttribute('data-copied');
    element.dataset.copyTimeoutId = '';
  }, 2000);
  element.dataset.copyTimeoutId = String(id);
}

async function init() {
  const user = await requireAdmin();
  if (!user) return;

  setupCopyHandler();
  setupTabs();
  setupPagination();
  renderTabs();

  const refresh = document.getElementById('refresh-button');
  if (refresh) {
    refresh.addEventListener('click', (event) => {
      event.preventDefault();
      loadTokens();
    });
  }

  await loadTokens();
}

init();
