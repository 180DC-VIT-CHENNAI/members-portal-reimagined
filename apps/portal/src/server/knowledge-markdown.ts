/** Deliberately small markdown dialect. Escape first; raw HTML and active URLs are never rendered. */
export function renderKnowledgeMarkdown(body: string): string {
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return escaped.split(/\r?\n/).map((line) => {
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    const text = (heading?.[2] ?? line).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    return heading ? `<h${heading[1].length}>${text}</h${heading[1].length}>` : `<p>${text || '<br>'}</p>`;
  }).join('\n');
}
