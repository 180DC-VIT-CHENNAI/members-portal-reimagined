import { defineScheduled } from 'void';
import { drainMailboxQueue } from '../src/server/mailboxes/dispatch';

export const cron = '* * * * *';
export default defineScheduled(async () => {
  await drainMailboxQueue();
});
