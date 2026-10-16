import { departments, people, positions, tenures, terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePrincipal } from '../../../../src/server/guard';
import { badRequest, forbidden, idParam } from '../../../../src/server/http';
import { getPersonOr404, personView } from '../../../../src/server/people';
import { can } from '../../../../src/server/permissions';
import { id, profileFields } from '../../../../src/server/validation';

/** One person with their full tenure history. */
export const GET = defineHandler(async (c) => {
  const viewer = await requirePrincipal(c);
  const person = await getPersonOr404(idParam(c));
  if (viewer.person.id !== person.id && !can(viewer.permissions, 'people.view')) forbidden();
  const history = await db
    .select({
      id: tenures.id,
      positionId: positions.id,
      title: positions.title,
      departmentId: positions.departmentId,
      termId: terms.id,
      termLabel: terms.label,
      startedOn: tenures.startedOn,
      endedOn: tenures.endedOn,
    })
    .from(tenures)
    .innerJoin(positions, eq(positions.id, tenures.positionId))
    .innerJoin(terms, eq(terms.id, tenures.termId))
    .where(eq(tenures.personId, person.id))
    .orderBy(desc(tenures.startedOn));
  return { ...personView(viewer, person), tenures: history };
});

const patchBody = v.object({ ...profileFields, departmentId: v.optional(v.nullable(id)) });

/**
 * Update a profile. Members edit their own profile fields; changing someone
 * else's profile, or anyone's department, needs people.edit for the affected
 * department(s).
 */
export const PATCH = defineHandler.withValidator({ body: patchBody })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const person = await getPersonOr404(idParam(c));
  const self = actor.person.id === person.id;
  const { departmentId, ...profile } = body;

  if (!self && !can(actor.permissions, 'people.edit', person.departmentId)) forbidden();
  if (departmentId !== undefined && departmentId !== person.departmentId) {
    if (!can(actor.permissions, 'people.edit', person.departmentId) || !can(actor.permissions, 'people.edit', departmentId)) {
      forbidden();
    }
    if (departmentId) {
      const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId));
      if (!dept) badRequest('unknown_department');
    }
  }
  const changes = { ...profile, ...(departmentId !== undefined ? { departmentId } : {}) };
  if (Object.keys(changes).length === 0) badRequest('nothing_to_update');

  const [updated] = await db
    .update(people)
    .set({ ...changes, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) })
    .where(eq(people.id, person.id))
    .returning();
  await audit(actor.person.id, self ? 'profile.update_self' : 'person.update', 'person', person.id, {
    fields: Object.keys(changes),
  });
  return personView(actor, updated);
});
