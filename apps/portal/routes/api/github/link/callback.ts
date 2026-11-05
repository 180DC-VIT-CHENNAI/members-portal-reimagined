import { HTTPException } from 'hono/http-exception';
import { defineHandler } from 'void';
import { finishLink } from '../../../../src/server/github/sync/accounts';
import { callbackQuery } from '../../../../src/server/github/sync/inputs';
import { requirePrincipal } from '../../../../src/server/guard';
import { rateLimit } from '../../../../src/server/rate-limit';
import type { Principal } from '../../../../src/server/principal';

export const GET = defineHandler.withValidator({ query: callbackQuery })(async (c, { query }) => {
  let principal: Principal;
  try {
    principal = await requirePrincipal(c);
  } catch (err) {
    if (err instanceof HTTPException && err.status === 401) return c.redirect('/login', 302);
    throw err;
  }
  await rateLimit(c, 'github_link', 20, 3600);
  const result = await finishLink(principal, new URL(c.req.url).origin, query);
  return c.redirect(`/people/${principal.person.id}?github=${result}`, 302);
});
