import * as v from 'valibot';
import { defineHandler } from 'void';
import { requestUnsubscribe, subscriptionOrigin } from '../../../src/server/newsletter/subscriptions';
import { rateLimit } from '../../../src/server/rate-limit';
import { emailAddress } from '../../../src/server/validation';

export const POST = defineHandler.withValidator({ body: v.object({ email: emailAddress }) })(async (c, { body }) => {
  const origin = subscriptionOrigin(c);
  await rateLimit(c, 'newsletter_unsubscribe_link', 5, 3600);
  await requestUnsubscribe(origin, body.email);
  return { requested: true };
});
