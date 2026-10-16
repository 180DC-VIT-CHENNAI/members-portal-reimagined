import { people } from '@schema';
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, inArray } from 'void/db';
import { audit } from '../../src/server/audit';
import { enqueueEmailCampaign } from '../../src/server/email/queue';
import { sendEmail } from '../../src/server/email/send';
import { requirePermission } from '../../src/server/guard';
import { escapeHtml } from '../../src/server/html';
import { badRequest } from '../../src/server/http';
import { rateLimit } from '../../src/server/rate-limit';

export const POST = defineHandler.withValidator({
  body: v.object({
    to: v.pipe(v.string(), v.maxLength(20_000)),
    subject: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000)),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'email.send');
  await rateLimit(c, 'send_email', 10, 3600);
  let recipients = [...new Set(body.to.toLowerCase().split(/[,;\s]+/)
    .filter((email) => v.safeParse(v.pipe(v.string(), v.email()), email).success))];
  if (!recipients.length) badRequest('no_valid_recipients');
  const scope = actor.permissions.get('email.send');
  if (scope !== 'global') {
    const members = scope && scope.size ? await db.select({ email: people.email }).from(people)
      .where(and(inArray(people.status, ['active', 'on_leave']), inArray(people.departmentId, [...scope]))) : [];
    const allowed = new Set(members.map((p) => p.email.toLowerCase()));
    recipients = recipients.filter((email) => allowed.has(email));
    if (!recipients.length) throw new HTTPException(403, { message: 'no_permitted_recipients' });
  }
  const from = '180DC Admin <technical@180dcvitc.org>';
  const html = '<p>' + escapeHtml(body.body).replace(/\n/g, '<br>') + '</p>';
  let sent = 0;
  let failed = 0;
  let remaining = recipients;
  if (recipients.length <= 10) {
    for (const [index, recipient] of recipients.entries()) {
      const result = await sendEmail({ from, to: recipient, subject: body.subject, html });
      if (result.status === 'paused') { remaining = recipients.slice(index); break; }
      if (result.status === 'sent') sent++;
      else failed++;
      remaining = recipients.slice(index + 1);
    }
  }
  const campaignId = remaining.length ? await enqueueEmailCampaign({
    kind: 'custom', fromAddress: from, recipients: remaining, subject: body.subject, html, createdBy: actor.person.id,
  }) : null;
  await audit(actor.person.id, 'email.send', 'email_campaign', campaignId, {
    sent, failed, queued: remaining.length, total: recipients.length,
  });
  return { sent, failed, queued: remaining.length, total: recipients.length, campaignId };
});
