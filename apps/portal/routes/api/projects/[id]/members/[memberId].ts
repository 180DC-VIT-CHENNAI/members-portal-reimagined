import { projectMembers } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { routeParam } from '../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../src/server/http';
import { projectFor, requireRight } from '../../../../../src/server/projects';

/** Take someone off the project. Tasks assigned to them stay assigned. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manageMembers');
  const memberId = routeParam(c, 'memberId');
  const [removed] = await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, loaded.project.id)))
    .returning({ personId: projectMembers.personId, role: projectMembers.role });
  if (!removed) notFound('member_not_found');
  await audit(actor.person.id, 'project.member.remove', 'project', loaded.project.id, removed);
  return { id: memberId };
});
