export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/env.js') {
      const apiBaseCandidates = [
        env.API_BASE_URL,
        env.BACKEND_URL,
        env.BACKEND_API_BASE_URL,
        env.RENDER_BACKEND_URL,
        env.SAVANT_API_BASE_URL,
      ].filter((value) => typeof value === 'string' && value.trim().length > 0);

      const fallbackLocal = 'http://localhost:4000';
      const apiBaseUrl = apiBaseCandidates[0] || fallbackLocal;

      const config = {
        apiBaseUrl,
        frontendOrigin: env.FRONTEND_ORIGIN || undefined,
        environment: env.APP_ENV || env.NODE_ENV || 'production',
      };

      const headers = {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      };

      if (request.method === 'HEAD') {
        return new Response(null, { headers });
      }

      const body = `window.__SAVANT_CONFIG__ = Object.assign(window.__SAVANT_CONFIG__ || {}, ${JSON.stringify(
        config
      )});`;

      return new Response(body, { headers });
    }

    return env.ASSETS.fetch(request, env, ctx);
  },
};
