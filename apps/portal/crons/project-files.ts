import { env } from 'cloudflare:workers';
import { defineScheduled } from 'void';
import { drainProjectFileDeletions } from '../src/server/project-file-cleanup';

export const cron = '*/5 * * * *';

export default defineScheduled(async () => {
  await drainProjectFileDeletions(env.CLUB_FILES);
});
