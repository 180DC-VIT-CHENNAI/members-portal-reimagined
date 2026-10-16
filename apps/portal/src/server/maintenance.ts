import { maintenanceMode } from '@schema';
import { db, eq } from 'void/db';

export const DEFAULT_MAINTENANCE_MESSAGE = 'Site is under maintenance. Please check back later.';

export async function readMaintenance(): Promise<{ enabled: boolean; message: string }> {
  const [row] = await db.select({ enabled: maintenanceMode.enabled, message: maintenanceMode.message }).from(maintenanceMode).where(eq(maintenanceMode.id, 1));
  return row ?? { enabled: false, message: '' };
}
