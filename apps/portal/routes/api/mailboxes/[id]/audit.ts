import { mailAudit } from '@schema';
import { defineHandler } from 'void';
import { and, db, desc, eq, lt } from 'void/db';
import { requirePrincipal } from '../../../../src/server/guard';
import { badRequest, idParam } from '../../../../src/server/http';
import { mailboxFor, requireCapability } from '../../../../src/server/mailboxes/access';

export const GET = defineHandler(async (c) => {
  const id = idParam(c);
  requireCapability(await mailboxFor(await requirePrincipal(c), id), 'mailbox.audit');
  const raw = c.req.query('before');
  const before = raw === undefined ? null : Number(raw);
  if (before !== null && (!Number.isSafeInteger(before) || before <= 0)) badRequest('invalid_cursor');
  c.header('Cache-Control', 'private, no-store');
  return { audit: await db.select().from(mailAudit)
    .where(and(eq(mailAudit.mailboxId, id), before === null ? undefined : lt(mailAudit.id, before)))
    .orderBy(desc(mailAudit.id)).limit(50) };
});
