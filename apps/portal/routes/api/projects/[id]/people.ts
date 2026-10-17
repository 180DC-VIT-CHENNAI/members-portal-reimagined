import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { forbidden, idParam } from '../../../../src/server/http';
import { projectFor, projectPeople } from '../../../../src/server/projects';

/** Everyone with access, for the member and assignee pickers of people who manage the project. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  const loaded = await projectFor(principal, idParam(c));
  if (!loaded.access.manageMembers && !loaded.access.manageTasks) forbidden();
  return projectPeople(loaded);
});
