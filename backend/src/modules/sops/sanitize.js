export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let out = html.replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gis, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  out = out.replace(/(href|src)\s*=\s*(['"])javascript:.*?\2/gi, '$1="#"');
  return out;
}
