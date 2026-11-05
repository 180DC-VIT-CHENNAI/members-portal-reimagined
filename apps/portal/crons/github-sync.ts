import { defineScheduled } from 'void';
import { runGitHubSync } from '../src/server/github/sync/backfill';

export const cron = '*/10 * * * *';

export default defineScheduled(async () => {
  await runGitHubSync();
});
