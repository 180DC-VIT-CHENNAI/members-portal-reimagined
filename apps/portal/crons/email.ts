import { defineScheduled } from 'void';
import { env } from 'cloudflare:workers';
import { drainEmailQueue } from '../src/server/email/queue';

export const cron = '* * * * *';

export default defineScheduled(async () => {
  await drainEmailQueue(env.CASE_STUDIES);
});
