import * as v from 'valibot';
import { defineHandler } from 'void';
import { subscribe, subscriptionOrigin } from '../../../src/server/newsletter/subscriptions';
import { rateLimit } from '../../../src/server/rate-limit';
import { emailAddress, optionalText } from '../../../src/server/validation';

export const POST = defineHandler.withValidator({ body: v.object({ email: emailAddress, name: optionalText(120) }) })(async (c, { body }) => {
  const origin = subscriptionOrigin(c);
  await rateLimit(c, 'newsletter_subscribe', 5, 3600);
  await subscribe(origin, body.email, body.name || null);
  return { pending: true };
});
