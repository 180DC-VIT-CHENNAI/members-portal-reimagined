import * as v from 'valibot';
import { defineHandler } from 'void';
import { confirm, subscriptionOrigin } from '../../../src/server/newsletter/subscriptions';
import { rateLimit } from '../../../src/server/rate-limit';

export const POST = defineHandler.withValidator({ body: v.object({ token: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/, 'confirmation_invalid')) }) })(async (c, { body }) => {
  const origin = subscriptionOrigin(c);
  await rateLimit(c, 'newsletter_confirm', 20, 3600);
  return { confirmed: true, ...await confirm(origin, body.token) };
});
