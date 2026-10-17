import { defineHandler } from 'void';
import { routeParam } from '../../../../src/server/departments';
import { subscriptionOrigin, unsubscribe } from '../../../../src/server/newsletter/subscriptions';

/** RFC 8058 one-click: accepts a form POST without cookies or an Origin; GET never changes a subscription. */
export const POST = defineHandler(async (c) => {
  subscriptionOrigin(c);
  c.header('Cache-Control', 'no-store');
  return unsubscribe(routeParam(c, 'token'));
});
