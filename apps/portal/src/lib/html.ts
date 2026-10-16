const TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'STRONG', 'B', 'EM', 'I', 'U', 'BR', 'DIV',
  'SPAN', 'A', 'IMG', 'HR', 'SUB', 'SUP', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'CAPTION', 'COL', 'COLGROUP',
]);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE']);
const ATTRS = new Set(['href', 'src', 'alt', 'title', 'width', 'height']);
const SAFE_URL = /^(https?:|mailto:|\/(?!\/)|#)/i;

/**
 * Second line of defence for case-study HTML (the API already sanitises it):
 * keep allow-listed tags and attributes, unwrap anything else, and only allow
 * http(s), mailto and same-origin links.
 */
export function cleanHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      walk(child);
      if (!TAGS.has(child.tagName)) {
        child.replaceWith(...(DROP.has(child.tagName) ? [] : [...child.childNodes]));
        continue;
      }
      for (const attr of [...child.attributes]) {
        const isUrl = attr.name === 'href' || attr.name === 'src';
        if (!ATTRS.has(attr.name) || (isUrl && !SAFE_URL.test(attr.value.trim()))) child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A') {
        child.setAttribute('rel', 'noopener noreferrer');
        child.setAttribute('target', '_blank');
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
