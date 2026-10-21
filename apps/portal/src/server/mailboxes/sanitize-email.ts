import { escapeHtml } from '../html.ts';

const TAGS = new Set(['p', 'br', 'hr', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'blockquote',
  'pre', 'code', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'a', 'img']);
const VOID_TAGS = new Set(['br', 'hr', 'img']);

function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] ?? '' : '';
}

function webUrl(value: string): string | null {
  // Reject obfuscated schemes, controls, CSS, data URLs and protocol-relative resources.
  const decoded = value.replace(/&amp;/gi, '&');
  if (!/^https?:\/\//i.test(decoded) || /[\x00-\x20\x7f<>"\\]|&(?:#|[a-z]+;)/i.test(decoded)) return null;
  try {
    const u = new URL(decoded);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

/** Reconstruct known passive tags, never copy an input attribute or CSS declaration. */
export function sanitizeEmailHtml(input: string, remote = false) {
  if (input.length > 500_000) return { html: null, remoteBlocked: false };
  let remoteBlocked = false;
  const source = input.replace(/<(script|style|head|template|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const html = (source.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g) ?? []).map((token) => {
    if (!token.startsWith('<')) return escapeHtml(token).replace(/&amp;(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, '&$1;');
    const tag = /^<(\/?)([a-z][a-z0-9]*)\b/i.exec(token);
    if (!tag) return '';
    const name = tag[2].toLowerCase();
    if (!TAGS.has(name)) return '';
    if (tag[1]) return VOID_TAGS.has(name) ? '' : `</${name}>`;
    if (name === 'img') {
      const src = webUrl(attribute(token, 'src'));
      const alt = attribute(token, 'alt').slice(0, 200);
      if (src) remoteBlocked = true;
      return src && remote ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" referrerpolicy="no-referrer">`
        : `<span>[${escapeHtml(alt || 'Image blocked')} ]</span>`;
    }
    if (name === 'a') {
      const href = webUrl(attribute(token, 'href'));
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` : '<a>';
    }
    return `<${name}>`;
  }).join('');
  return { html, remoteBlocked };
}

export function emailDocument(html: string, remote: boolean): string {
  const policy = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${remote ? 'https: http:' : "'none'"}; form-action 'none'; base-uri 'none'; connect-src 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>body{font:15px/1.6 system-ui,sans-serif;overflow-wrap:anywhere;color:#18251d;margin:16px}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}td,th{padding:4px}pre{white-space:pre-wrap}blockquote{border-left:3px solid #cbd5ce;margin:12px 0;padding-left:12px}</style></head><body>${html}</body></html>`;
}
