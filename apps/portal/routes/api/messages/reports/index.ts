import { defineHandler } from 'void';
import { requirePermission } from '../../../../src/server/guard';
import { openReports } from '../../../../src/server/messaging/reports';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Open message reports (`chat.moderate`). */
export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'chat.moderate', null);
  await rateLimit(c, 'messages_read', 240, 60);
  c.header('Cache-Control', 'private, no-store');
  return openReports();
});
