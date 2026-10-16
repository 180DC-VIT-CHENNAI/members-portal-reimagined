import { consultingRequests } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { rateLimit } from '../../src/server/rate-limit';
import { emailAddress, optionalText } from '../../src/server/validation';

const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

/** Public "work with us" form. One submission per IP per hour, as before. */
export const POST = defineHandler.withValidator({
  body: v.object({
    name: text(255),
    email: emailAddress,
    phone: v.pipe(v.string(), v.trim(), v.regex(/^[+0-9 ()-]{6,20}$/, 'invalid_phone')),
    organization: text(255),
    roleInOrg: optionalText(255),
    requirement: text(2000),
  }),
})(async (c, { body }) => {
  await rateLimit(c, 'consulting_request', 1, 3600);
  await db.insert(consultingRequests).values({ id: crypto.randomUUID(), ...body, roleInOrg: body.roleInOrg || null });
  return c.json({ submitted: true as const }, 201);
});
