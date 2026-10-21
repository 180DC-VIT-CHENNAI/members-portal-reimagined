import { defineHandler } from 'void';
import { requirePermission } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { resolveInput, resolveReport } from '../../../../src/server/messaging/reports';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Dismiss a report, or remove the reported message (`chat.moderate`). */
export const POST = defineHandler.withValidator({ body: resolveInput })(async (c, { body }) => {
  const principal = await requirePermission(c, 'chat.moderate', null);
  await rateLimit(c, 'messages_write', 60, 60);
  return resolveReport(principal, Number(idParam(c)), body.action);
});
