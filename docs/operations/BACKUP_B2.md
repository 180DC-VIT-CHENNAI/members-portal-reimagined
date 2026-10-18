# Backblaze B2 backup and R2 failover (reimagined)

The scheduled backup covers the live Void portal (`180dc-portal`, D1 `180dc-portal-db`) and the retained legacy deployment (`members-portal-reimagined`). Both use the personal account's named R2 buckets. The club deployment has no B2 configuration.

## What runs

| Layer | Where | What it does |
|-------|-------|--------------|
| Live mirror | `apps/admin-api/storage-failover.ts` (wraps `CLUB_FILES`, `BLOG_IMAGES`, `CASE_STUDIES`, `GALLERY_CDN`) | Every R2 write is copied to B2 in the background (`ctx.waitUntil`); every R2 delete is mirrored. |
| Write failover | same | If an R2 write throws, the object is written to B2 instead, so uploads during an R2 outage are not lost. |
| Read failover | same | If an R2 read/head/list throws, B2 serves it. If R2 has no object, B2 is checked too, so outage-time uploads stay readable after R2 recovers. |
| Daily full copy | `.github/workflows/backup.yml` (20:30 UTC = 02:00 IST, also manual) | `rclone copy` of all four R2 buckets to B2 using rclone's native `b2` backend (its S3-compatible mode misreads B2 prefixes as files). Never `sync`, so B2-only objects are kept. |
| Daily D1 export | same workflow | SQL exports of `180dc-portal-db`, `members-portal-reimagined-db` and `members-portal-reimagined-newsletter` (Wrangler pinned to an exact version), gzipped. The portal export is restored in memory by `scripts/verify-portal-backup.mjs` before upload; a failed check stops the job. |
| Manifest | same workflow | `manifests/<UTC timestamp>.txt` in B2: the verifier's counts, the SHA-256 of each uploaded export and `rclone size` of each mirrored bucket folder. Counts only, no member data. |
| Failure alert | same workflow | A failed run writes an error annotation and job summary. Issues are disabled on this repository, so the alert is GitHub's failed-workflow email to the schedule owner. |

Deletes still require R2: a B2-only delete would let the R2 copy reappear later.

## B2 layout (bucket `180dc-vitc`, endpoint `https://s3.eu-central-003.backblazeb2.com`)

```
r2/club_files/<key>      r2/blog_images/<key>
r2/case_studies/<key>    r2/gallery_cdn/<key>
d1/<database-name>/<UTC timestamp>.sql.gz
manifests/<UTC timestamp>.txt
```

rclone is installed from a pinned release whose SHA-256 is checked in the workflow; bump `PINNED_RCLONE` and `PINNED_RCLONE_ZIP_SHA256` together from `https://downloads.rclone.org/<version>/SHA256SUMS`.

Custom metadata is stored in the `x-amz-meta-r2-custom` header (URI-encoded JSON). Retention: no lifecycle rule yet, so B2 keeps every version and export (decision pending).

## Credentials (names only)

B2 application keys are restricted to bucket `180dc-vitc`:

| Key name | Capabilities | Stored as |
|----------|--------------|-----------|
| `180dc-worker-write` | writeFiles, deleteFiles | Worker secrets `B2_KEY_ID`, `B2_APPLICATION_KEY` |
| `180dc-worker-read` | readFiles, listFiles | Worker secrets `B2_READ_KEY_ID`, `B2_READ_APPLICATION_KEY` |
| `180dc-backup-ci` | listFiles, readFiles, writeFiles | GitHub secrets `B2_KEY_ID`, `B2_APPLICATION_KEY` |

Worker vars `B2_S3_ENDPOINT` and `B2_BUCKET` are in `wrangler.jsonc`. Without the read key the Worker only mirrors/fails over writes; without the write key and vars it behaves exactly like plain R2.

The portal declares the same optional keys in `apps/portal/env.ts`; setting them is an explicit operational choice. Its bucket adapter wraps only the requested bucket. Without these secrets, it uses R2 directly. Keep scheduled backups and recovery drills even when live failover is enabled: a mirror also copies accidental writes and deletions, so it is not a substitute for recoverable history.

GitHub Actions secrets on `members-portal-reimagined`: `CLOUDFLARE_API_TOKEN` (user token `180dc-reimagined-backup-ci`: D1 Write on the personal account, R2 object read on the four reimagined buckets), `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (derived from that token: token ID and SHA-256 of its value), `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_S3_ENDPOINT`, `B2_BUCKET`. The workflow only runs in `180DC-VIT-CHENNAI/members-portal-reimagined`.

## Operations

- Run a backup now: Actions -> "Backup to Backblaze B2" -> Run workflow.
- Mirror failures are logged as `[b2-mirror] ...`; failovers as `[r2-failover] ...` (Workers Logs). The daily copy repairs missed mirrors.
- `wrangler d1 export` can briefly block the database while it runs; the schedule is 02:00 IST to keep that off-peak.
- Restore a file: copy `r2/<binding>/<key>` back with `rclone copy b2:180dc-vitc/r2/<binding>/<key> r2:<bucket>/<dir>`.
- The backup token must cover the portal D1 database as well as both legacy databases. A successful legacy export alone does not prove portal coverage.

## Portal recovery drill

1. Download a trusted export from `d1/180dc-portal-db/<UTC timestamp>.sql.gz`. Do not use a legacy database export. Check it against the same timestamp's manifest: `sha256sum` must match its `sha256` line.
2. From the repository root, restore it into an in-memory SQLite database and check structure, integrity and foreign keys:

   ```bash
   node scripts/verify-portal-backup.mjs /path/to/180dc-portal-db.sql.gz
   ```

   The command prints only table and record counts, never member data. A nonzero exit is a failed drill. The verifier also accepts an uncompressed `.sql`. It executes trusted backup SQL locally; do not feed it an untrusted file.
3. Check that the export time and reported people count match the expected recovery point. The daily schedule can lose up to a day's database changes; R2 copies and D1 exports are not an atomic snapshot.
4. Before any live restore, obtain approval and restore the dump into a separate empty D1 database in the same account. Use `cf auth whoami`, then discover the import operation with `cf cli search "execute sql file database"`. Confirm the account and scratch database explicitly. Do not import over the live portal or run the destructive legacy `packages/db/schema.sql`.
5. Point a separate nonproduction portal at the scratch database and matching restored private files. Disable live sending and use captured email. Verify Google access for the recovery operator, project/task reads, a private file download, newsletter counts and saved letters.
6. A production binding change or replacing live data is a separate approved action. Record the backup timestamp, file-copy timestamp, verification output, operator and result. Retain the old database until the restored portal is accepted.

The offline verifier is covered by `apps/portal/tests/e2e/backup.test.mjs`. A passing offline restore does not claim that the scheduled GitHub job ran, that production credentials cover the database, or that a live recovery drill was performed.
