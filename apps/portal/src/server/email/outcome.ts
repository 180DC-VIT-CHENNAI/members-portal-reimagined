import type { SendEmailError, SendEmailErrorCode, SendEmailResult } from 'void/email';

/**
 * What one `sendEmail` result means for the queue (codes from void/email):
 * - `paused` with `quota`: Cloudflare's rate or daily limit; stop sending for
 *   the rest of the hour.
 * - `paused`: not the recipient's fault (no binding, sender not ready,
 *   provider outage); try again later without failing anyone.
 * - `failed`: this recipient did not get the message. `mayHaveSent` marks
 *   OUTCOME_UNKNOWN: Cloudflare may still have accepted it, so it counts
 *   against the allowance and is only resent when someone retries the campaign.
 */
export type SendOutcome =
  | { readonly status: 'sent' }
  | { readonly status: 'paused'; readonly error: string; readonly quota: boolean }
  | { readonly status: 'failed'; readonly error: string; readonly mayHaveSent: boolean };

function firstError(result: Exclude<SendEmailResult, { ok: true }>): SendEmailError | undefined {
  if ('error' in result) return result.error;
  for (const delivery of result.deliveries) if (!delivery.ok) return delivery.error;
  return undefined;
}

export function classifySend(result: SendEmailResult): SendOutcome {
  if (result.ok) return { status: 'sent' };
  const error = firstError(result);
  // Void always names the failing recipient; without one, assume Cloudflare may have the message.
  if (!error) return { status: 'failed', error: 'OUTCOME_UNKNOWN: no recipient error reported', mayHaveSent: true };
  const message = `${error.code}: ${error.message}`.slice(0, 500);
  switch (error.code) {
    case 'QUOTA_EXCEEDED':
      return { status: 'paused', error: message, quota: true };
    case 'BINDING_MISSING':
    case 'INVALID_FROM':
    case 'UPSTREAM_ERROR':
      return { status: 'paused', error: message, quota: false };
    case 'OUTCOME_UNKNOWN':
      return { status: 'failed', error: message, mayHaveSent: true };
    case 'INVALID_TO':
    case 'UNVERIFIED_DESTINATION':
    case 'MIME_ERROR':
    case 'IDEMPOTENCY_CONFLICT':
      return { status: 'failed', error: message, mayHaveSent: false };
    default: {
      const unhandled: never = error.code;
      throw new Error(`Unhandled email error code: ${String(unhandled)}`);
    }
  }
}

/** Reserved test domains: capture mode answers for them the way Void reports that failure. */
const SIMULATED = new Map<string, SendEmailErrorCode>([
  ['unverified.invalid', 'UNVERIFIED_DESTINATION'],
  ['unknown.invalid', 'OUTCOME_UNKNOWN'],
  ['quota.invalid', 'QUOTA_EXCEEDED'],
  ['upstream.invalid', 'UPSTREAM_ERROR'],
]);

/**
 * Capture mode's stand-in for `sendEmail`: accepts every recipient except the
 * reserved domains above. An upstream error is request-level; binding errors
 * are reported per recipient, as Void does.
 */
export function simulatedResult(recipient: string): SendEmailResult {
  const code = SIMULATED.get(recipient.slice(recipient.lastIndexOf('@') + 1));
  if (!code) return { ok: true, ids: [{ recipient, messageId: `capture-${crypto.randomUUID()}` }] };
  const error = { code, message: `simulated ${code}` };
  return code === 'UPSTREAM_ERROR' ? { ok: false, error } : { ok: false, deliveries: [{ recipient, ok: false, error }] };
}
