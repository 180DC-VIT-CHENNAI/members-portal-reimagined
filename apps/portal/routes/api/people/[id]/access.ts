import { accessRoles, departments, people, personGrants } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq, inArray } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, idParam } from '../../../../src/server/http';
import { getPersonOr404 } from '../../../../src/server/people';
import { isPermission } from '../../../../src/server/permissions';
import { id } from '../../../../src/server/validation';

/** Replace a person's access role and individual grants. */
export const PUT = defineHandler.withValidator({
  body: v.object({
    accessRoleId: id,
    grants: v.pipe(
      v.array(v.object({ permission: v.pipe(v.string(), v.check(isPermission, 'unknown_permission')), departmentId: v.nullable(id) })),
      v.maxLength(100),
    ),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'people.grants');
  const person = await getPersonOr404(idParam(c));
  if (actor.person.id === person.id) badRequest('cannot_change_own_access');

  const [role] = await db.select().from(accessRoles).where(eq(accessRoles.id, body.accessRoleId));
  if (!role) badRequest('unknown_access_role');
  const deptIds = [...new Set(body.grants.map((g) => g.departmentId).filter((d): d is string => d !== null))];
  if (deptIds.length) {
    const found = await db.select({ id: departments.id }).from(departments).where(inArray(departments.id, deptIds));
    if (found.length !== deptIds.length) badRequest('unknown_department');
  }
  const unique = [...new Map(body.grants.map((g) => [`${g.permission}|${g.departmentId}`, g])).values()];

  await db.batch([
    db.update(people).set({ accessRoleId: role.id }).where(eq(people.id, person.id)),
    db.delete(personGrants).where(eq(personGrants.personId, person.id)),
    ...unique.map((g) =>
      db.insert(personGrants).values({
        id: crypto.randomUUID(),
        personId: person.id,
        permission: g.permission,
        departmentId: g.departmentId,
        grantedBy: actor.person.id,
      }),
    ),
  ]);
  await audit(actor.person.id, 'person.access', 'person', person.id, { accessRoleId: role.id, grants: unique });
  return { id: person.id, accessRoleId: role.id, grants: unique };
});
