// Google sign-in without a third-party SDK: OAuth 2.0 authorization code flow
// with PKCE. The ID token is received directly from Google's token endpoint
// over TLS using the client secret, so per OpenID Connect Core 3.1.3.7 its
// signature need not be re-verified; issuer, audience, expiry and subject are.

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export class GoogleOAuthError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomUrlToken(byteLength = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function googleAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string; challenge: string; authUrl?: string }): string {
  const url = new URL(opts.authUrl || GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', opts.state);
  url.searchParams.set('code_challenge', opts.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

function decodeJwtPayload(jwt: string): any {
  const part = jwt.split('.')[1];
  if (!part) throw new GoogleOAuthError('invalid_token', 'Malformed ID token');
  const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
  const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export type GoogleIdentity = { sub: string; email: string | null; emailVerified: boolean; name: string | null };

export function identityFromClaims(claims: any, clientId: string, nowSeconds = Math.floor(Date.now() / 1000)): GoogleIdentity {
  if (!claims || !GOOGLE_ISSUERS.includes(claims.iss)) throw new GoogleOAuthError('invalid_token', 'ID token issuer is not Google');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(clientId)) throw new GoogleOAuthError('invalid_token', 'ID token audience mismatch');
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) throw new GoogleOAuthError('invalid_token', 'ID token expired');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new GoogleOAuthError('invalid_token', 'ID token has no subject');
  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}

export async function exchangeGoogleCode(opts: {
  code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string;
  tokenUrl?: string; fetcher?: typeof fetch;
}): Promise<GoogleIdentity> {
  const res = await (opts.fetcher || fetch)(opts.tokenUrl || GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      code_verifier: opts.verifier,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.id_token !== 'string') {
    throw new GoogleOAuthError('exchange_failed', `Google token exchange failed (${res.status}${body.error ? ': ' + body.error : ''})`);
  }
  return identityFromClaims(decodeJwtPayload(body.id_token), opts.clientId);
}
