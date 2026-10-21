import { defineHandler } from 'void';
import { env } from 'void/env';
import { bucket } from '../../../src/server/buckets';
import { emailTestMode } from '../../../src/server/email/send';
import { badRequest, notFound } from '../../../src/server/http';
import { InboundSizeError, readInboundBytes } from '../../../src/server/mailboxes/inbound-handler';
import { ingestInbound } from '../../../src/server/mailboxes/ingest';

/** .dev.ts is excluded from production; both capture AND the explicit flag are required locally. */
export const POST = defineHandler(async (c) => {
  if (import.meta.env.PROD || emailTestMode() !== 'capture' || env.INBOUND_TEST_INGEST !== '1') notFound();
  const from = c.req.query('from'), to = c.req.query('to'), stream = c.req.raw.body;
  if (!from || !to || from.length > 320 || to.length > 320 || !stream) badRequest('invalid_envelope');
  try {
    return await ingestInbound({ from, to, raw: await readInboundBytes(stream) }, bucket(c, 'CLUB_FILES'));
  } catch (error) {
    if (error instanceof InboundSizeError) badRequest('message_too_large');
    throw error;
  }
});
