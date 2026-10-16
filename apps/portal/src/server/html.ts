// Allow-list HTML sanitiser for case-study bodies, ported from the old Worker's
// sanitizeBlogHtml so stored content keeps the same shape.

const SAFE_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'b', 'em', 'i', 'u',
  'br', 'div', 'span', 'a', 'img', 'hr', 'sub', 'sup', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'col', 'colgroup',
]);

const SAFE_ATTRS = new Set(['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'width', 'height']);

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Keep allow-listed tags and attributes; drop scripts, handlers and script URLs. */
export function sanitizeHtml(input: string): string {
  let s = input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*on\w+\s*=[^>]*>/gi, (m) => m.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''));

  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, slash: string, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    if (!SAFE_TAGS.has(tag)) return escapeHtml(match);
    const safe = attrs.replace(/([a-zA-Z:-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, (attr) => {
      const name = attr.match(/^([a-zA-Z:-]+)/)?.[1]?.toLowerCase();
      if (!name || !SAFE_ATTRS.has(name)) return '';
      if (name === 'href' || name === 'src') {
        const value = decodeEntities(attr.replace(/^[^=]*=\s*/, '').replace(/^["']|["']$/g, '')).replace(/\s+/g, '').toLowerCase();
        if (/^(javascript|data|vbscript):/.test(value)) return '';
      }
      return attr;
    });
    const selfClose = /\/$/.test(attrs.trim()) ? ' /' : '';
    return `<${slash}${tag}${safe.trim() ? ` ${safe.trim()}` : ''}${selfClose}>`;
  });

  return s.replace(/<[^>]*>/g, (match) => {
    const inner = match.slice(1, -1).trim();
    if (!inner) return '';
    const name = (inner.startsWith('/') ? inner.slice(1) : inner.split(/\s+/)[0]).toLowerCase();
    return SAFE_TAGS.has(name) ? match : '';
  });
}

export function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}
