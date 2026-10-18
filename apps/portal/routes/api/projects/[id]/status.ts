import { PROJECT_STATUSES, projects } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { projectFor, requireRight } from '../../../../src/server/projects';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Change project stage. Only completed, non-internal projects are public. */
export const PUT = defineHandler.withValidator({ body: v.object({ status: v.picklist(PROJECT_STATUSES) }) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manage');
  if (loaded.project.status === body.status) return { status: body.status, changed: false };
  await rateLimit(c, 'projects_write', 60, 3600);
  const completedAt = body.status === 'completed' ? new Date().toISOString() : null;
  await db.update(projects).set({ status: body.status, completedAt }).where(eq(projects.id, loaded.project.id));
  await audit(actor.person.id, body.status === 'completed' ? 'project.complete' : 'project.reopen', 'project', loaded.project.id);
  return { status: body.status, changed: true };
});
