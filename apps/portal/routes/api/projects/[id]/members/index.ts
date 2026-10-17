import { projectMembers } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { requirePrincipal } from '../../../../../src/server/guard';
import { badRequest, conflict, idParam } from '../../../../../src/server/http';
import { loadPersonPrincipal } from '../../../../../src/server/principal';
import { memberRole, notifyProjectMember, projectFor, requireRight } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { id } from '../../../../../src/server/validation';

/** Name someone on the project with their role there, and email them. */
export const POST = defineHandler.withValidator({ body: v.object({ personId: id, role: memberRole }) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manageMembers');
  await rateLimit(c, 'projects_write', 60, 3600);
  const target = await loadPersonPrincipal(body.personId);
  if (!target) badRequest('person_without_access');
  const memberId = crypto.randomUUID();
  const [added] = await db
    .insert(projectMembers)
    .values({ id: memberId, projectId: loaded.project.id, personId: target.person.id, role: body.role, createdBy: actor.person.id })
    .onConflictDoNothing()
    .returning({ id: projectMembers.id });
  if (!added) conflict('already_member');
  await notifyProjectMember(loaded.project, target.person, body.role, actor.person);
  await audit(actor.person.id, 'project.member.add', 'project', loaded.project.id, { personId: target.person.id, role: body.role });
  return c.json({ id: memberId }, 201);
});
