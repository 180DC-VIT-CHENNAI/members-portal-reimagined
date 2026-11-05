import { defineEnv, string } from 'void/env';

// Declare every environment key here and read it through `env` from 'void/env'.
export default defineEnv({
  AUTH_GOOGLE_CLIENT_ID: string(),
  AUTH_GOOGLE_CLIENT_SECRET: string(),
  // Self-imposed cap on messages per UTC hour (default 500). Mail itself goes
  // through Cloudflare Email Sending (the SEND_EMAIL binding in void.config.ts).
  EMAIL_HOURLY_LIMIT: string().optional(),
  // Local tests only: "capture" records mail in dev_outbox instead of sending it.
  EMAIL_TEST_MODE: string().optional(),
  INBOUND_TEST_INGEST: string().optional(),
  ENVIRONMENT: string().optional(),
  // Optional Backblaze B2 failover for the R2 buckets (src/server/buckets.ts).
  // Without the first four, files live in R2 only.
  B2_S3_ENDPOINT: string().optional(),
  B2_BUCKET: string().optional(),
  B2_KEY_ID: string().optional(),
  B2_APPLICATION_KEY: string().optional(),
  B2_READ_KEY_ID: string().optional(),
  B2_READ_APPLICATION_KEY: string().optional(),
  // GitHub App integration (src/server/github/config.ts). All optional so the
  // portal deploys with the integration switched off; set them with `void secret put`.
  GITHUB_APP_ID: string().optional(),
  // PKCS#8 PEM (`BEGIN PRIVATE KEY`), real newlines or `\n` escapes.
  GITHUB_APP_PRIVATE_KEY: string().optional(),
  GITHUB_WEBHOOK_SECRET: string().optional(),
  GITHUB_APP_CLIENT_ID: string().optional(),
  GITHUB_APP_CLIENT_SECRET: string().optional(),
  // base64 of 32 random bytes; enables user-attributed writes.
  GITHUB_TOKEN_ENCRYPTION_KEY: string().optional(),
  // Local tests only: points GitHub calls at a fake server. Ignored in production.
  GITHUB_TEST_API_URL: string().optional(),
});
