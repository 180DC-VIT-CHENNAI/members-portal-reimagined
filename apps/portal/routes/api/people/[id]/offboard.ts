import { auditLog, offboardingRecords, people } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, idParam } from '../../../../src/server/http';
import { nextStatus } from '../../../../src/server/lifecycle';
import { activeSuccessor, planOffboarding, previewOffboarding } from '../../../../src/server/offboarding';
// Registers each package's offboarding step (see registerOffboardingStep).
import '../../../../src/server/mailboxes/offboarding';
import '../../../../src/server/crm/offboarding';
import { getPersonOr404 } from '../../../../src/server/people';
import { sqlNow, statusHistoryInsert, todayIso } from '../../../../src/server/status-history';
import { calendarDate, id } from '../../../../src/server/validation';

/** What offboarding would clean up now, plus earlier runs (people.offboard for their department). */
export const GET = defineHandler(async (c) => {
  const person = await getPersonOr404(idParam(c));
  const actor = await requirePermission(c, 'people.offboard', person.departmentId);
  const [preview, records] = await Promise.all([
    previewOffboarding({ person, actorPersonId: actor.person.id, effectiveOn: todayIso() }),
    db.select().from(offboardingRecords).where(eq(offboardingRecords.personId, person.id)).orderBy(desc(offboardingRecords.createdAt)),
  ]);
  return { status: person.status, ...preview, records };
});

/**
 * Offboard a person to alumni or removed in one D1 batch: status change and
 * history, every registered cleanup step (sessions, task and project
 * reassignment to `successorId`, tenures, personal grants, later packages'
 * steps), the handover record and the audit entry. Re-running it after
 * success changes nothing and reports `changed: false`.
 */
export const POST = defineHandler.withValidator({
  body: v.object({
    status: v.picklist(['alumni', 'removed']),
    successorId: v.optional(v.nullable(id)),
    reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
    effectiveOn: v.optional(calendarDate),
    handover: v.optional(
      v.pipe(v.array(v.object({ item: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)), done: v.boolean() })), v.maxLength(30)),
      [],
    ),
  }),
})(async (c, { body }) => {
  const person = await getPersonOr404(idParam(c));
  const actor = await requirePermission(c, 'people.offboard', person.departmentId);
  if (actor.person.id === person.id) badRequest('cannot_offboard_self');
  const effectiveOn = body.effectiveOn ?? todayIso();
  if (effectiveOn > todayIso()) badRequest('effective_date_in_future');

  const statusChanges = person.status !== body.status;
  if (statusChanges) {
    const result = nextStatus(person.status, body.status, person.authUserId !== null);
    if (!result.ok) badRequest(result.reason);
  }
  const successorId = body.successorId ?? null;
  if (successorId && (successorId === person.id || !(await activeSuccessor(successorId)))) badRequest('invalid_successor');

  const plan = await planOffboarding({ person, successorId, actorPersonId: actor.person.id, effectiveOn });
  if (plan.needsSuccessor && !successorId) badRequest('successor_required');
  const changed = statusChanges || plan.statements.length > 0;
  if (!changed) return { id: person.id, status: person.status, changed: false, summary: plan.summary, recordId: null };

  const recordId = crypto.randomUUID();
  await db.batch([
    db.insert(offboardingRecords).values({
      id: recordId,
      personId: person.id,
      toStatus: body.status,
      successorId,
      reason: body.reason,
      effectiveOn,
      checklist: [...plan.labels, ...body.handover],
      summary: plan.summary,
      actorPersonId: actor.person.id,
    }),
    db.insert(auditLog).values({
      actorPersonId: actor.person.id,
      action: 'person.offboard',
      targetType: 'person',
      targetId: person.id,
      details: { recordId, from: person.status, to: body.status, successorId, summary: plan.summary },
    }),
    ...(statusChanges
      ? [
          db.update(people).set({ status: body.status, statusChangedAt: sqlNow(), updatedAt: sqlNow() }).where(eq(people.id, person.id)),
          statusHistoryInsert({ personId: person.id, from: person.status, to: body.status, reason: body.reason, effectiveOn, actorPersonId: actor.person.id }),
        ]
      : []),
    ...plan.statements,
  ]);
  return { id: person.id, status: body.status, changed: true, summary: plan.summary, recordId };
});
