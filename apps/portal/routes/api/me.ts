import { defineHandler } from 'void';
import { requirePrincipal } from '../../src/server/guard';
import { serializePermissions } from '../../src/server/principal';

/** The signed-in member's own record and effective permissions. */
export const GET = defineHandler((c) => {
  const { person, permissions } = requirePrincipal(c);
  return { person, permissions: serializePermissions(permissions) };
});
