import { HTTPException } from 'hono/http-exception';
import { defineHandler } from 'void';
import { githubSettings } from '../../../src/server/github/runtime';
import { GITHUB_LIMITS, type WebhookResponse } from '../../../src/server/github/types';
import { failureDetail, gateIds } from '../../../src/server/github/webhook/dispatch';
import { handleDelivery } from '../../../src/server/github/webhook/handlers';
import { claimDelivery, finishDelivery } from '../../../src/server/github/webhook/ledger';
import { sha256Hex, verifySignature } from '../../../src/server/github/webhook/verify';
import { rateLimit } from '../../../src/server/rate-limit';

const MAX_DELIVERY_ID_LENGTH = 100;

function fail(status: 400 | 401 | 413 | 500 | 503, code: string): never {
  throw new HTTPException(status, { message: code });
}

export const POST = defineHandler(async (c): Promise<WebhookResponse> => {
  const secret = githubSettings().webhookSecret;
  if (!secret) return fail(503, 'github_not_configured');

  const declared = Number(c.req.header('content-length'));
  if (Number.isFinite(declared) && declared > GITHUB_LIMITS.webhookBodyBytes) return fail(413, 'payload_too_large');
  const body = new Uint8Array(await c.req.arrayBuffer());
  if (body.byteLength > GITHUB_LIMITS.webhookBodyBytes) return fail(413, 'payload_too_large');

  if (!(await verifySignature(secret, body, c.req.header('x-hub-signature-256')))) {
    await rateLimit(c, 'github_webhook_rejected', 30, 600);
    return fail(401, 'invalid_signature');
  }

  const event = c.req.header('x-github-event');
  const deliveryId = c.req.header('x-github-delivery');
  if (!event || !deliveryId || deliveryId.length > MAX_DELIVERY_ID_LENGTH) return fail(400, 'missing_delivery_headers');

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return fail(400, 'payload_invalid');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return fail(400, 'payload_invalid');

  const { action } = payload as { action?: unknown };
  const claimed = await claimDelivery({
    id: deliveryId,
    event,
    action: typeof action === 'string' ? action : null,
    ...gateIds(payload),
    payloadSha256: await sha256Hex(body),
  });
  if (!claimed) return { ok: true, status: 'duplicate' };

  let outcome;
  try {
    outcome = await handleDelivery(deliveryId, event, payload);
  } catch (error) {
    const detail = failureDetail(error);
    console.error('github webhook failed', deliveryId, detail);
    await finishDelivery(deliveryId, 'failed', detail);
    return fail(500, 'webhook_failed');
  }
  if (outcome.status === 'ignored') {
    await finishDelivery(deliveryId, 'ignored', outcome.reason);
    return { ok: true, status: 'ignored', reason: outcome.reason };
  }
  await finishDelivery(deliveryId, 'processed', null);
  return { ok: true, status: 'processed' };
});
