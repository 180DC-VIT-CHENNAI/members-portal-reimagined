import { departments, MEET_KINDS, meetDepartments, meets } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, inArray } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';
import { listMeets, notifyMeet, requireMeetManage } from '../../../src/server/meets';
import { rateLimit } from '../../../src/server/rate-limit';
import { id, optionalText } from '../../../src/server/validation';

/** Club-wide and inter-department meets, plus the department meets the caller may see; earliest first. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePermission(c, 'meets.view');
  return listMeets(principal);
});

function isWebUrl(value: string) {
  const { protocol } = new URL(value);
  return protocol === 'https:' || protocol === 'http:';
}

/** Schedule a meet and queue its announcement to the audience. */
export const POST = defineHandler.withValidator({
  body: v.object({
    kind: v.picklist(MEET_KINDS),
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255), v.transform((value) => value.replace(/\s+/g, ' '))),
    scheduledAt: v.pipe(v.string(), v.isoTimestamp(), v.transform((value) => new Date(value).toISOString())),
    meetLink: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.url(), v.maxLength(500), v.check(isWebUrl, 'invalid_meet_link')))),
    description: optionalText(2000),
    departmentIds: v.optional(v.pipe(v.array(id), v.maxLength(20)), []),
  }),
})(async (c, { body }) => {
  const departmentIds = [...new Set(body.departmentIds)];
  switch (body.kind) {
    case 'club':
      if (departmentIds.length) badRequest('club_meets_have_no_departments');
      break;
    case 'department':
      if (departmentIds.length !== 1) badRequest('one_department_required');
      break;
    case 'inter_department':
      if (!departmentIds.length) badRequest('departments_required');
      break;
  }
  const actor = await requireMeetManage(c, body.kind, departmentIds);
  await rateLimit(c, 'meets_write', 60, 3600);
  if (departmentIds.length) {
    const found = await db.select({ id: departments.id }).from(departments).where(inArray(departments.id, departmentIds));
    if (found.length !== departmentIds.length) badRequest('unknown_department');
  }
  const meet = {
    id: crypto.randomUUID(),
    kind: body.kind,
    title: body.title,
    description: body.description || null,
    meetLink: body.meetLink || null,
    scheduledAt: body.scheduledAt,
  };
  await db.batch([
    db.insert(meets).values({ ...meet, createdBy: actor.person.id }),
    ...departmentIds.map((departmentId) => db.insert(meetDepartments).values({ meetId: meet.id, departmentId })),
  ]);
  const notice = await notifyMeet(meet, departmentIds, actor.person);
  await audit(actor.person.id, 'meet.create', 'meet', meet.id, { kind: meet.kind, departmentIds, queued: notice.queued });
  return c.json({ id: meet.id, ...notice }, 201);
});
