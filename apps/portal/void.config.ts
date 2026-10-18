import { defineConfig } from 'void/config';
import { SENDER_ADDRESS } from './src/server/email/sender';

// The Void rewrite deploys to its own Worker. Production (180dc.vitcc.org)
// stays on the current Worker until the cutover PR moves the domain here.
export default defineConfig({
  worker: {
    compatibility_date: '2026-10-01',
    compatibility_flags: ['nodejs_compat'],
  },
  auth: {
    providers: ['google'],
  },
  cloudflare: {
    name: '180dc-portal',
    // Production domain since the cutover from the old members-portal-reimagined
    // Worker; the repo-root wrangler.jsonc must never declare it again, or that
    // Worker's next CI deploy takes it back. workers.dev stays reachable and
    // preview URLs back the deploy readiness check.
    routes: [{ pattern: '180dc.vitcc.org', custom_domain: true }],
    workers_dev: true,
    preview_urls: true,
    // The buckets the current deployment (repo-root wrangler.jsonc) uses in
    // this account, bound by name so the portal reads the same objects. The
    // club account's names (180dc-club-files, cdn, ...) do not exist here.
    // BLOG_IMAGES arrives with the projects slice. Locally these are simulated
    // under the dev state directory.
    r2_buckets: [
      { binding: 'CLUB_FILES', bucket_name: 'members-portal-reimagined-club-files' },
      { binding: 'CASE_STUDIES', bucket_name: 'members-portal-reimagined-case-studies' },
      { binding: 'GALLERY_CDN', bucket_name: 'members-portal-reimagined-gallery' },
    ],
    // Cloudflare Email Sending, used through sendEmail() from 'void/email'.
    // 180dc.vitcc.org is onboarded for sending in this account. `email.from` is
    // left unset on purpose: it would make Void manage Email Routing as well,
    // which the portal does not use. Every send passes an explicit sender.
    send_email: [{ name: 'SEND_EMAIL', allowed_sender_addresses: [SENDER_ADDRESS] }],
  },
});
