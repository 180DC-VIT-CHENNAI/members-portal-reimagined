/**
 * AES-256-GCM sealing of GitHub user tokens (design 6.4) plus the base64
 * helpers app.ts and user-auth.ts share. Pure: Web Crypto only.
 *
 * Format: `v1.<keyId>.<iv>.<ciphertext>` (base64url). `keyId` is the first 8
 * hex characters of SHA-256 of the key bytes; the AAD is
 * `github-token:<personId>:<field>`, so a ciphertext only opens for the same
 * person and field under the same key.
 */

export function base64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes standard or URL-safe base64, padded or not. Throws on invalid input. */
export function base64Decode(value: string): Uint8Array<ArrayBuffer> {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface ImportedKey {
  readonly key: CryptoKey;
  readonly keyId: string;
}

async function importKey(keyBase64: string): Promise<ImportedKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = base64Decode(keyBase64);
  } catch {
    throw new Error('token_key_invalid');
  }
  if (raw.length !== 32) throw new Error('token_key_invalid');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const keyId = hex(await crypto.subtle.digest('SHA-256', raw)).slice(0, 8);
  return { key, keyId };
}

function additionalData(personId: string, field: 'access' | 'refresh'): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`github-token:${personId}:${field}`);
}

export async function sealToken(keyBase64: string, personId: string, field: 'access' | 'refresh', token: string): Promise<string> {
  const { key, keyId } = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(personId, field) },
    key,
    new TextEncoder().encode(token),
  );
  return `v1.${keyId}.${base64urlEncode(iv)}.${base64urlEncode(ciphertext)}`;
}

/** Null for another key, a tampered value, or another person or field. Throws only for an unusable key. */
export async function openToken(keyBase64: string, personId: string, field: 'access' | 'refresh', sealed: string): Promise<string | null> {
  const { key, keyId } = await importKey(keyBase64);
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || parts[1] !== keyId) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64Decode(parts[2] ?? ''), additionalData: additionalData(personId, field) },
      key,
      base64Decode(parts[3] ?? ''),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
