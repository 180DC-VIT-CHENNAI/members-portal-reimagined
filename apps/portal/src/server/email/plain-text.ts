function decodeEntities(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded: string) => {
      const code = encoded.toLowerCase().startsWith('x')
        ? parseInt(encoded.slice(1), 16)
        : parseInt(encoded, 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

/** Plain-text alternative for an HTML body: no scripts or styles, links kept as "label (href)". */
export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
      .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
        (_match, href: string, label: string) => `${label.replace(/<[^>]+>/g, '').trim()} (${href})`)
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
    .trim();
}
