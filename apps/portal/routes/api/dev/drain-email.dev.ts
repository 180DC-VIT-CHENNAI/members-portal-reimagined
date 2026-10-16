import { HTTPException } from 'hono/http-exception';
import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { drainEmailQueue } from '../../../src/server/email/queue';
import { emailTestMode } from '../../../src/server/email/send';

/** Development-only, synchronous drain for capture integration tests. */
export const POST = defineHandler(async (c) => {
  if (emailTestMode() !== 'capture') throw new HTTPException(404);
  return drainEmailQueue(bucket(c, 'CASE_STUDIES'));
});
