import type { MailIdentity } from './inbox-types.ts';
import { digest } from './rules.ts';

/** Envelope addresses are compared in full; no plus-alias or domain guessing. */
export function normalizedAddress(value: string): string | null {
  const match = /^([^\s<>@]+)@([^\s<>@]+)$/.exec(value.trim());
  if (!match || match[1].length > 64 || value.length > 320) return null;
  try {
    const domain = new URL(`https://${match[2]}`).hostname;
    if (!/^[a-z0-9.-]+$/i.test(domain) || !domain.includes('.') || /[/\\:#?%]/.test(match[2])) return null;
    return `${match[1].toLowerCase()}@${domain.toLowerCase()}`;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export function safeLine(value: string, limit = 300): string {
  return value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, limit);
}

export function safeFilename(value: string | null): string {
  return safeLine((value ?? 'attachment').split(/[/\\]/).at(-1) ?? 'attachment', 160)
    .replace(/["<>:|?*]/g, '_').replace(/^\.+/, '_') || 'attachment';
}

export function attachmentAllowed(filename: string, mime: string): boolean {
  // No scanner is installed. Only this narrow passive-content allowlist is released.
  const ext = filename.toLowerCase().split('.').at(-1);
  const allowed: Readonly<Record<string, readonly string[]>> = {
    txt: ['text/plain'], csv: ['text/csv', 'text/plain'], pdf: ['application/pdf'],
    png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], gif: ['image/gif'], webp: ['image/webp'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  };
  return !!ext && !!allowed[ext]?.includes(mime.toLowerCase());
}

export function messageIds(value: string): string[] {
  return [...value.slice(0, 16_384).matchAll(/<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]{1,254})>/g)]
    .map((m) => m[1]).filter((id) => id.includes('@')).slice(-50);
}

export function subjectKey(value: string): string {
  return value.normalize('NFKC').replace(/^(?:(?:re|fw|fwd|aw|wg|sv)\s*(?:\[\d+\])?:\s*)+/gi, '')
    .replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 300);
}

export function externalParticipants(identities: readonly MailIdentity[], own: string): string[] {
  return [...new Set(identities.map((i) => i.address).filter((a) => a && a !== own))].slice(0, 100);
}

/** Preserve content identity across Received/ARC/SPF trace-header rewrites. */
export async function contentIdentity(input: { readonly raw: ArrayBuffer; readonly from: string; readonly to: string }): Promise<string> {
  const bytes = new Uint8Array(input.raw);
  let split = -1;
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) { split = i + 4; break; }
    if (bytes[i] === 10 && bytes[i + 1] === 10) { split = i + 2; break; }
  }
  const headers = new TextDecoder().decode(bytes.slice(0, Math.min(split < 0 ? bytes.length : split, 131_072)))
    .replace(/\r?\n[ \t]+/g, ' ');
  const stable = headers.split(/\r?\n/).filter((h) => /^(message-id|date|from|to|cc|subject|content-type|content-transfer-encoding):/i.test(h)).join('\n');
  return digest(JSON.stringify([input.from.toLowerCase(), input.to.toLowerCase(), stable,
    await digest(bytes.slice(split < 0 ? 0 : split).buffer)]));
}
