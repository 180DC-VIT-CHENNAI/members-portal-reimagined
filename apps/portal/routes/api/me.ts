import { defineHandler } from 'void';
import { requirePrincipal } from '../../src/server/guard';
import { serializePermissions } from '../../src/server/principal';

/** The signed-in member's own record and effective permissions. */
export const GET = defineHandler(async (c) => {
  const { person, permissions } = await requirePrincipal(c);
  return { person, permissions: serializePermissions(permissions) };
});
