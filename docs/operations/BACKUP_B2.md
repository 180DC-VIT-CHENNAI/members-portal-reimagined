# Backblaze B2 backup and R2 failover (reimagined)

Applies to the personal single-Worker deployment (`members-portal-reimagined`, repo-root `wrangler.jsonc`). The club deployment has no B2 configuration, so its R2 behaviour is unchanged.

## What runs

| Layer | Where | What it does |
|-------|-------|--------------|
| Live mirror | `apps/admin-api/storage-failover.ts` (wraps `CLUB_FILES`, `BLOG_IMAGES`, `CASE_STUDIES`, `GALLERY_CDN`) | Every R2 write is copied to B2 in the background (`ctx.waitUntil`); every R2 delete is mirrored. |
| Write failover | same | If an R2 write throws, the object is written to B2 instead, so uploads during an R2 outage are not lost. |
| Read failover | same | If an R2 read/head/list throws, B2 serves it. If R2 has no object, B2 is checked too, so outage-time uploads stay readable after R2 recovers. |
| Daily full copy | `.github/workflows/backup.yml` (20:30 UTC = 02:00 IST, also manual) | `rclone copy` of all four R2 buckets to B2. Never `sync`, so B2-only objects are kept. |
| Daily D1 export | same workflow | `wrangler d1 export --remote` of `members-portal-reimagined-db` and `members-portal-reimagined-newsletter`, gzipped. |

Deletes still require R2: a B2-only delete would let the R2 copy reappear later.

## B2 layout (bucket `180dc-vitc`, endpoint `https://s3.eu-central-003.backblazeb2.com`)

```
r2/club_files/<key>      r2/blog_images/<key>
r2/case_studies/<key>    r2/gallery_cdn/<key>
d1/<database-name>/<UTC timestamp>.sql.gz
```

Custom metadata is stored in the `x-amz-meta-r2-custom` header (URI-encoded JSON). Retention: no lifecycle rule yet, so B2 keeps every version and export (decision pending).

## Credentials (names only)

B2 application keys are restricted to bucket `180dc-vitc`:

| Key name | Capabilities | Stored as |
|----------|--------------|-----------|
| `180dc-worker-write` | writeFiles, deleteFiles | Worker secrets `B2_KEY_ID`, `B2_APPLICATION_KEY` |
| `180dc-worker-read` | readFiles, listFiles | Worker secrets `B2_READ_KEY_ID`, `B2_READ_APPLICATION_KEY` |
| `180dc-backup-ci` | listFiles, readFiles, writeFiles | GitHub secrets `B2_KEY_ID`, `B2_APPLICATION_KEY` |

Worker vars `B2_S3_ENDPOINT` and `B2_BUCKET` are in `wrangler.jsonc`. Without the read key the Worker only mirrors/fails over writes; without the write key and vars it behaves exactly like plain R2.

GitHub Actions secrets on `members-portal-reimagined`: `CLOUDFLARE_API_TOKEN` (user token `180dc-reimagined-backup-ci`: D1 Write on the personal account, R2 object read on the four reimagined buckets), `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (derived from that token: token ID and SHA-256 of its value), `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_S3_ENDPOINT`, `B2_BUCKET`. The workflow only runs in `180DC-VIT-CHENNAI/members-portal-reimagined`.

## Operations

- Run a backup now: Actions -> "Backup to Backblaze B2" -> Run workflow.
- Mirror failures are logged as `[b2-mirror] ...`; failovers as `[r2-failover] ...` (Workers Logs). The daily copy repairs missed mirrors.
- `wrangler d1 export` can briefly block the database while it runs; the schedule is 02:00 IST to keep that off-peak.
- Restore a file: copy `r2/<binding>/<key>` back with `rclone copy b2:180dc-vitc/r2/<binding>/<key> r2:<bucket>/<dir>`.
- Restore D1: download the `.sql.gz`, gunzip, `wrangler d1 execute <db> --remote --file <dump>.sql` into an empty database.
