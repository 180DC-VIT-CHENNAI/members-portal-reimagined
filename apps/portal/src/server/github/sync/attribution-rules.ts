import { type FallbackReason, GITHUB_ERROR_KINDS, type GitHubErrorInfo, type GitHubErrorKind } from '../types.ts';

/** Reads the GitHubErrorInfo fields off any thrown value (the client's GitHubError class implements them). */
export function asGitHubError(err: unknown): GitHubErrorInfo | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;
  if (typeof e.kind !== 'string' || !(GITHUB_ERROR_KINDS as readonly string[]).includes(e.kind)) return null;
  return {
    kind: e.kind as GitHubErrorKind,
    status: typeof e.status === 'number' ? e.status : null,
    message: typeof e.message === 'string' ? e.message : '',
    retryAfterSeconds: typeof e.retryAfterSeconds === 'number' ? e.retryAfterSeconds : null,
    documentationUrl: typeof e.documentationUrl === 'string' ? e.documentationUrl : null,
  };
}

export type UserFailureDecision =
  | { readonly retry: false }
  | { readonly retry: true; readonly reason: Extract<FallbackReason, 'token_revoked' | 'user_forbidden'>; readonly revokeToken: boolean };

/** Section 9.1: what to do when GitHub refuses a write made with the actor's user token. */
export function decideUserFailure(info: GitHubErrorInfo | null): UserFailureDecision {
  if (!info) return { retry: false };
  if (info.kind === 'unauthorized') return { retry: true, reason: 'token_revoked', revokeToken: true };
  if (info.kind === 'forbidden' || info.kind === 'not_found') return { retry: true, reason: 'user_forbidden', revokeToken: false };
  return { retry: false };
}

/** Only letters, digits, spaces and . ' - survive, so a name cannot mention or format anything. */
export function safeName(fullName: string): string {
  return fullName.replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim();
}

/** The attribution footer added to bodies created with the installation token. */
export function withFooter(body: string | undefined, kind: 'issue' | 'comment', fullName: string): string {
  const name = safeName(fullName) || 'a portal member';
  const line = kind === 'issue' ? `_Opened from the 180DC portal by ${name}._` : `_Posted from the 180DC portal by ${name}._`;
  const text = (body ?? '').trimEnd();
  return text ? `${text}\n\n---\n${line}` : `---\n${line}`;
}
