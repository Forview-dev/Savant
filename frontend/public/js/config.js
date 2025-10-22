(function () {
  const existing = window.SavantConfig || {};
  const scriptConfig = window.__SAVANT_CONFIG__ || {};
  const fallbackLocal = 'http://localhost:4000';

  const candidates = [];
  const pushCandidate = (value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach(pushCandidate);
      return;
    }
    const raw = String(value).trim();
    if (!raw) return;
    candidates.push(raw);
  };

  pushCandidate(scriptConfig.apiBaseUrl);
  pushCandidate(scriptConfig.API_BASE_URL);
  pushCandidate(scriptConfig.backendUrl);
  pushCandidate(scriptConfig.BACKEND_URL);
  pushCandidate(scriptConfig.backend_base_url);
  pushCandidate(scriptConfig.API_BASE);

  const meta = document.querySelector('meta[name="api-base-url"]');
  if (meta) {
    pushCandidate(meta.getAttribute('content'));
  }

  if (window.location && window.location.protocol === 'https:') {
    pushCandidate(window.location.origin);
  }

  pushCandidate(fallbackLocal);

  const normalize = (urlLike) => {
    try {
      const resolved = new URL(urlLike, window.location.origin);
      if (window.location.protocol === 'https:' && resolved.protocol === 'http:') {
        resolved.protocol = 'https:';
      }
      resolved.hash = '';
      resolved.search = '';
      return resolved.href.replace(/\/+$/, '');
    } catch (err) {
      console.warn('Ignoring invalid API base URL candidate', urlLike, err);
      return null;
    }
  };

  const apiBaseUrl = candidates
    .map(normalize)
    .filter(Boolean)
    .shift();

  const finalConfig = {
    ...existing,
    apiBaseUrl: apiBaseUrl || fallbackLocal,
  };

  finalConfig.ready = Promise.resolve(finalConfig);
  window.SavantConfig = finalConfig;
  window.getApiBaseUrl = function getApiBaseUrl() {
    return window.SavantConfig.apiBaseUrl;
  };
})();
