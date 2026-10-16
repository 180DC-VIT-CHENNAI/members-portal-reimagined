import { defineConfig } from 'void/config';

// The Void rewrite deploys to its own Worker. Production (180dc.vitcc.org)
// stays on the current Worker until the cutover PR moves the domain here.
export default defineConfig({
  worker: {
    compatibility_date: '2026-10-01',
    compatibility_flags: ['nodejs_compat'],
  },
  cloudflare: {
    name: '180dc-portal',
  },
});
