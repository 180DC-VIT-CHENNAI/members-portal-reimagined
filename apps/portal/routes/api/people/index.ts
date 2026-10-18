import { accessRoles, auditLog, departments, emailQueue, people, positions, tenures, terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, asc, db, eq, inArray, like, or, sql } from 'void/db';
import { env } from 'void/env';
import { PERSON_STATUSES } from '../../../db/schema/people';
import { requirePermission } from '../../../src/server/guard';
import { badRequest, conflict } from '../../../src/server/http';
import { checkInvitation, invitationCampaign, invitationHtml, invitationOrigin, isUniqueViolation } from '../../../src/server/invitations';
import { personView } from '../../../src/server/people';
import { can } from '../../../src/server/permissions';
import { emailAddress, fullName, id } from '../../../src/server/validation';

const listQuery = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  status: v.optional(v.picklist(PERSON_STATUSES)),
  department: v.optional(id),
  role: v.optional(id),
  position: v.optional(id),
  term: v.optional(id),
});

/** Directory: search and filter people. */
export const GET = defineHandler.withValidator({ query: listQuery })(async (c, { query }) => {
  const viewer = await requirePermission(c, 'people.view');
  const where = [];
  if (query.q) {
    const pattern = `%${query.q.replace(/[%_]/g, '')}%`;
    where.push(or(like(people.fullName, pattern), like(people.email, pattern), like(people.skills, pattern)));
  }
  if (query.status) where.push(eq(people.status, query.status));
  if (query.department) where.push(eq(people.departmentId, query.department));
  if (query.role) where.push(eq(people.accessRoleId, query.role));
  if (query.position || query.term) {
    const tenureWhere = [];
    if (query.position) tenureWhere.push(eq(tenures.positionId, query.position));
    if (query.term) tenureWhere.push(eq(tenures.termId, query.term));
    where.push(
      inArray(
        people.id,
        db.select({ id: tenures.personId }).from(tenures).where(and(...tenureWhere)),
      ),
    );
  }
  const rows = await db
    .select()
    .from(people)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(people.fullName))
    .limit(1000);

  const ids = rows.map((p) => p.id);
  const current = ids.length
    ? await db
        .select({ personId: tenures.personId, positionId: positions.id, title: positions.title, termId: tenures.termId })
        .from(tenures)
        .innerJoin(positions, eq(positions.id, tenures.positionId))
        .innerJoin(terms, eq(terms.id, tenures.termId))
        .where(and(inArray(tenures.personId, ids), eq(terms.isCurrent, true), sql`${tenures.endedOn} IS NULL`))
    : [];
  return rows.map((p) => ({
    ...personView(viewer, p),
    positions: current.filter((t) => t.personId === p.id).map(({ personId: _p, ...t }) => t),
  }));
});

const inviteBody = v.object({
  email: emailAddress,
  fullName,
  departmentId: v.optional(v.nullable(id)),
  accessRoleId: v.optional(id, 'member'),
  positionId: v.optional(id),
});

/**
 * Add a person by email and queue their invitation email. Everything is
 * validated first; the person, their tenure, the email campaign and the audit
 * entry are then written in one D1 batch, so either all exist or none do.
 * They become active on their first Google sign-in.
 */
export const POST = defineHandler.withValidator({ body: inviteBody })(async (c, { body }) => {
  const departmentId = body.departmentId ?? null;
  const actor = await requirePermission(c, 'people.invite', departmentId);
  if (body.accessRoleId !== 'member' && !can(actor.permissions, 'people.grants')) {
    badRequest('only_member_role_without_people_grants');
  }
  const [[role], [department], [position], [term], [existing]] = await Promise.all([
    db.select({ id: accessRoles.id }).from(accessRoles).where(eq(accessRoles.id, body.accessRoleId)),
    departmentId ? db.select().from(departments).where(eq(departments.id, departmentId)) : Promise.resolve([]),
    body.positionId ? db.select().from(positions).where(eq(positions.id, body.positionId)) : Promise.resolve([]),
    db.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true)),
    db.select({ id: people.id }).from(people).where(eq(people.email, body.email)),
  ]);
  const checked = checkInvitation({
    departmentId, department, roleExists: Boolean(role), positionId: body.positionId, position, currentTermId: term?.id,
  });
  if (!checked.ok) badRequest(checked.error);
  if (existing) conflict('email_already_exists');

  const personId = crypto.randomUUID();
  const production = import.meta.env.PROD || env.ENVIRONMENT === 'production';
  const campaign = invitationCampaign({
    recipients: [body.email],
    html: invitationHtml({ origin: invitationOrigin(c.req.url, production), inviterName: actor.person.fullName, fullName: body.fullName }),
    replyTo: actor.person.email,
    createdBy: actor.person.id,
    meta: { personId },
  });
  try {
    await db.batch([
      db.insert(people).values({
        id: personId,
        email: body.email,
        fullName: body.fullName,
        departmentId,
        accessRoleId: body.accessRoleId,
        invitedBy: actor.person.id,
      }),
      ...(checked.positionId && term
        ? [db.insert(tenures).values({
            id: crypto.randomUUID(),
            personId,
            positionId: checked.positionId,
            termId: term.id,
            startedOn: new Date().toISOString().slice(0, 10),
          })]
        : []),
      db.insert(emailQueue).values(campaign),
      db.insert(auditLog).values({
        actorPersonId: actor.person.id,
        action: 'person.invite',
        targetType: 'person',
        targetId: personId,
        details: { email: body.email, role: body.accessRoleId, campaignId: campaign.id },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) conflict('email_already_exists');
    throw error;
  }
  return c.json({ id: personId, status: 'invited' as const, campaignId: campaign.id }, 201);
});
