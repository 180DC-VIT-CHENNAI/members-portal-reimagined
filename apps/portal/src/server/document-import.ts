// Case-study import from PDF or DOCX, ported from the old Worker's
// /api/case-studies/upload-document. PDFs are read with a small text-stream
// scanner (no dependency); DOCX goes through mammoth, loaded on demand.
// Pure module (no void/* imports) so it runs under `node --test`.
import { escapeHtml, sanitizeHtml, stripTags } from './html.ts';

export const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export interface ImportedDocument {
  content: string;
  charCount: number;
  suggestedTitle: string;
  suggestedDescription: string;
}

async function inflate(data: Uint8Array): Promise<string> {
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
    return await new Response(stream).text();
  } catch {
    return '';
  }
}

function hexText(hex: string): string {
  let out = '';
  for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.substring(i, i + 4), 16));
  return out;
}

/** Text drawn by Tj/TJ operators in one content stream. */
function streamText(source: string, into: string[]): void {
  for (const m of source.matchAll(/\(([^)]*)\)\s*Tj/g)) into.push(m[1]);
  for (const m of source.matchAll(/\[([^\]]*)\]\s*TJ/g)) for (const s of m[1].matchAll(/\(([^)]*)\)/g)) into.push(s[1]);
  for (const m of source.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) into.push(hexText(m[1]));
  for (const m of source.matchAll(/\[\s*<([0-9A-Fa-f]+)>\s*\]\s*TJ/g)) into.push(hexText(m[1]));
}

const unescapePdf = (chunk: string) =>
  chunk.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, ' ').replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');

const clip = (text: string) => (text.length > 500 ? text.slice(0, 497) + '...' : text);

async function fromPdf(bytes: Uint8Array) {
  // Byte-for-byte decode: TextDecoder('latin1') is windows-1252 and would corrupt compressed streams.
  let raw = '';
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const chunks: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const inflated = await inflate(Uint8Array.from(m[1], (ch) => ch.charCodeAt(0) & 0xff));
    if (inflated) streamText(inflated, chunks);
  }
  if (chunks.length === 0) for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) streamText(m[1], chunks);
  const paragraphs = chunks.map(unescapePdf).join('\n\n').split(/\n{2,}/).filter((p) => p.trim());
  const html = paragraphs
    .flatMap((p) => p.trim().split('\n'))
    .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
    .join('\n');
  let title = raw.match(/\/Title\s*\(([^)]+)\)/)?.[1].trim() ?? '';
  if (!title && paragraphs.length) {
    const first = paragraphs[0].split('\n')[0].trim();
    if (first.length >= 3 && first.length <= 200) title = first;
  }
  const description = paragraphs.length > 1 ? clip(paragraphs[1].replace(/\n/g, ' ').trim()) : '';
  return { html, title, description };
}

async function fromDocx(buffer: ArrayBuffer) {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const first = text.split(/[.!?]\s/)[0]?.trim() ?? '';
  const title = first.length >= 3 && first.length <= 200 ? first : '';
  const rest = text.slice(title.length).trim();
  return { html, title, description: rest ? clip(rest) : '' };
}

/** Sanitized HTML plus a suggested title and summary, or null when the document has under 10 visible characters. */
export async function importDocument(kind: keyof typeof DOCUMENT_TYPES, buffer: ArrayBuffer): Promise<ImportedDocument | null> {
  const { html, title, description } = kind === 'pdf' ? await fromPdf(new Uint8Array(buffer)) : await fromDocx(buffer);
  const content = sanitizeHtml(html);
  const charCount = stripTags(content).trim().length;
  if (charCount < 10) return null;
  return { content, charCount, suggestedTitle: title, suggestedDescription: description };
}
