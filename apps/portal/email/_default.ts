import { env as bindings } from 'cloudflare:workers';
import { env } from 'void/env';
import { b2ConfigFromEnv, FailoverBucket } from '../src/server/storage-failover';
import { inboundHandler } from '../src/server/mailboxes/inbound-handler';
import { ingestInbound } from '../src/server/mailboxes/ingest';

export default inboundHandler(async (delivery, ctx) => {
  const config = b2ConfigFromEnv(env);
  const storage = config ? new FailoverBucket(bindings.CLUB_FILES, 'club_files', config, (p) => ctx.waitUntil(p)) : bindings.CLUB_FILES;
  return ingestInbound(delivery, storage);
});
