import { defineConfig } from 'void/config';

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
    // Reachable at 180dc-portal.srijan-guchhait.workers.dev until the cutover
    // adds the 180dc.vitcc.org custom domain; preview URLs back the readiness check.
    workers_dev: true,
    preview_urls: true,
    // The old Worker's buckets, bound by name so the portal reads the same
    // objects (same account). BLOG_IMAGES arrives with the projects slice.
    // Locally these are simulated under the dev state directory.
    r2_buckets: [
      { binding: 'CLUB_FILES', bucket_name: '180dc-club-files' },
      { binding: 'CASE_STUDIES', bucket_name: '180dc-case-studies' },
      { binding: 'GALLERY_CDN', bucket_name: 'cdn' },
    ],
  },
});
