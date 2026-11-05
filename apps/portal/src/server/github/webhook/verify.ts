/*
 * X-Hub-Signature-256 check for GitHub webhooks. Pure: Web Crypto only, so
 * Node's test runner and the Worker run the same code.
 */

const PREFIX = 'sha256=';
const HEX = /^[0-9a-f]{64}$/;

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const byte of view) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** SHA-256 (hex) of a body; the ledger keeps this instead of the payload. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

/**
 * True when `header` is `sha256=` + the hex HMAC-SHA256 of `body` under
 * `secret`. The comparison is `crypto.subtle.verify`, which is constant time;
 * a malformed header is rejected before any MAC is computed.
 */
export async function verifySignature(secret: string, body: Uint8Array<ArrayBuffer>, header: string | null | undefined): Promise<boolean> {
  if (!secret || !header || !header.startsWith(PREFIX)) return false;
  const hex = header.slice(PREFIX.length);
  if (!HEX.test(hex)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, hexToBytes(hex), body);
}
