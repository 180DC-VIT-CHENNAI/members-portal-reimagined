import { defineHandler } from 'void';
import { audit } from '../../../../src/server/audit';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { meetOr404, notifyMeet, requireMeetManage } from '../../../../src/server/meets';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Announce a meet again as a new campaign (10 an hour per client). */
export const POST = defineHandler(async (c) => {
  await requirePrincipal(c);
  await rateLimit(c, 'meet_notification', 10, 3600);
  const { meet, departmentIds } = await meetOr404(idParam(c));
  const actor = await requireMeetManage(c, meet.kind, departmentIds);
  const notice = await notifyMeet(meet, departmentIds, actor.person);
  await audit(actor.person.id, 'meet.notify', 'meet', meet.id, { queued: notice.queued });
  return notice;
});
