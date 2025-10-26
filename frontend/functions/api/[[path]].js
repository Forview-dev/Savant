// Cloudflare Pages Function: proxy /api/* to your Render backend
export const onRequest = async (ctx) => {
  const { request, env } = ctx;

  // 1) Compute target URL on Render
  const url = new URL(request.url);
  // Strip the leading /api/ and preserve the rest (path + query)
  const upstreamPath = url.pathname.replace(/^\/api\/?/, '');
  const target = new URL(upstreamPath + url.search, env.RENDER_API_BASE);

  // 2) Build headers for upstream; forward client cookies (session lives on FE domain)
  const reqHeaders = new Headers(request.headers);
  reqHeaders.delete('host');
  reqHeaders.delete('content-length');
  reqHeaders.delete('cf-connecting-ip');
  reqHeaders.delete('cf-ew-via');
  reqHeaders.delete('cf-ipcountry');
  reqHeaders.delete('cf-ray');
  reqHeaders.delete('cf-visitor');
  reqHeaders.delete('x-forwarded-for');
  reqHeaders.delete('x-forwarded-proto');

  // 3) Forward the request to Render (no auto-follow; we need Set-Cookie on 303)
  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers: reqHeaders,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  // 4) Clone response, preserve status/body/headers, including Set-Cookie
  const resHeaders = new Headers(upstream.headers);

  // We’re same-origin (Pages), so we don’t need CORS headers here; but
  // some frameworks set them upstream—keeping them is fine.
  // IMPORTANT: don’t touch Set-Cookie (no Domain set by your BE → cookie will be for FE origin)

  // Optional: if your backend sometimes returns absolute Location to itself,
  // you can rewrite to FE origin here. Not needed if BE uses FRONTEND_ORIGIN.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
};