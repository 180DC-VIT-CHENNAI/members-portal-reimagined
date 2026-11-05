/**
 * Environment -> GitHubSettings (design 3 and 6.1). Pure: the Worker glue in
 * runtime.ts passes the raw values in. Nothing here logs or returns a secret
 * other than inside the settings object itself.
 */
import { GITHUB_API_URL, GITHUB_WEB_URL, type GitHubConfigError, type GitHubSettings } from './types.ts';

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** `void secret put` may keep a PEM as one line with `\n` escapes: restore real newlines. */
function restoreNewlines(pem: string): string {
  return pem.replace(/\\r\\n|\\n/g, '\n').replace(/\r\n/g, '\n');
}

/** base64 of exactly 32 bytes (an AES-256 key). */
function isAes256Key(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    return atob(value).length === 32;
  } catch {
    return false;
  }
}

/**
 * Trims values, restores `\n` escapes in the key, and maps unusable input to a
 * `configError`. `app_id_invalid` and `private_key_not_pkcs8` switch the App
 * off (`app: null`); `token_key_invalid` only drops user-token storage.
 * `GITHUB_TEST_API_URL` replaces the API and web hosts outside production.
 */
export function parseGitHubSettings(raw: Readonly<Record<string, string | undefined>>, production: boolean): GitHubSettings {
  let configError: GitHubConfigError | null = null;

  const appId = clean(raw.GITHUB_APP_ID);
  const rawKey = clean(raw.GITHUB_APP_PRIVATE_KEY);
  let app: GitHubSettings['app'] = null;
  if (appId && rawKey) {
    const privateKeyPem = restoreNewlines(rawKey);
    if (!/^\d+$/.test(appId)) configError = 'app_id_invalid';
    else if (privateKeyPem.includes('BEGIN RSA PRIVATE KEY')) configError = 'private_key_not_pkcs8';
    else app = { appId, privateKeyPem };
  }

  const clientId = clean(raw.GITHUB_APP_CLIENT_ID);
  const clientSecret = clean(raw.GITHUB_APP_CLIENT_SECRET);
  const oauth = clientId && clientSecret ? { clientId, clientSecret } : null;

  const keyValue = clean(raw.GITHUB_TOKEN_ENCRYPTION_KEY);
  let tokenEncryptionKey: string | null = null;
  if (keyValue) {
    if (isAes256Key(keyValue)) tokenEncryptionKey = keyValue;
    else configError ??= 'token_key_invalid';
  }

  const testUrl = production ? null : clean(raw.GITHUB_TEST_API_URL)?.replace(/\/+$/, '') ?? null;

  return {
    app,
    webhookSecret: clean(raw.GITHUB_WEBHOOK_SECRET),
    oauth,
    tokenEncryptionKey,
    apiUrl: testUrl ?? GITHUB_API_URL,
    webUrl: testUrl ?? GITHUB_WEB_URL,
    configError,
  };
}
