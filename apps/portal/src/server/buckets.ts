import type { Context } from 'hono';
import { env } from 'void/env';
import { b2ConfigFromEnv, FailoverBucket } from './storage-failover.ts';

// R2 buckets shared with the old Worker, bound by name in void.config.ts.
declare global {
  namespace Cloudflare {
    interface Env {
      CLUB_FILES: R2Bucket;
      CASE_STUDIES: R2Bucket;
      GALLERY_CDN: R2Bucket;
    }
  }
}

export type BucketBinding = 'CLUB_FILES' | 'CASE_STUDIES' | 'GALLERY_CDN';

/**
 * One of the R2 buckets. When the B2_* secrets are set, writes are mirrored
 * to Backblaze B2 and reads fall back to it during an R2 outage, exactly as
 * in the old Worker (storage-failover.ts). Without them this is plain R2.
 */
export function bucket(c: Context, binding: BucketBinding): Pick<R2Bucket, 'get' | 'head' | 'put' | 'delete' | 'list'> {
  const raw = (c.env as Cloudflare.Env)[binding];
  const config = b2ConfigFromEnv(env);
  return config
    ? new FailoverBucket(raw, binding.toLowerCase(), config, (task) => c.executionCtx.waitUntil(task))
    : raw;
}
