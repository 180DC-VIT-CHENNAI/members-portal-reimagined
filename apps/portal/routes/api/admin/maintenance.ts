import { maintenanceMode } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission } from '../../../src/server/guard';
import { DEFAULT_MAINTENANCE_MESSAGE, readMaintenance } from '../../../src/server/maintenance';
import { rateLimit } from '../../../src/server/rate-limit';

/** Public: whether maintenance mode is on, and the message to show. */
export const GET = defineHandler(() => readMaintenance());

export const POST = defineHandler.withValidator({
  body: v.object({
    enabled: v.boolean(),
    message: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(500)))),
  }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'site.maintenance');
  await rateLimit(c, 'admin_maintenance_toggle', 5, 60);
  const state = { enabled: body.enabled, message: body.message || DEFAULT_MAINTENANCE_MESSAGE };
  const now = new Date().toISOString();
  await db
    .insert(maintenanceMode)
    .values({ id: 1, ...state, updatedBy: actor.person.id, updatedAt: now })
    .onConflictDoUpdate({ target: maintenanceMode.id, set: { ...state, updatedBy: actor.person.id, updatedAt: now } });
  await audit(actor.person.id, state.enabled ? 'maintenance.enable' : 'maintenance.disable', 'maintenance', '1', state);
  return state;
});
