import { defineScheduled } from 'void';
import { queueDueReminders } from '../src/server/notifications';

export const cron = '5 * * * *';

export default defineScheduled(async (controller) => {
  await queueDueReminders(new Date(controller.scheduledTime));
});
