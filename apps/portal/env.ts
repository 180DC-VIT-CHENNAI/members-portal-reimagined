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
  ENVIRONMENT: string().optional(),
  // Optional Backblaze B2 failover for the R2 buckets (src/server/buckets.ts).
  // Without the first four, files live in R2 only.
  B2_S3_ENDPOINT: string().optional(),
  B2_BUCKET: string().optional(),
  B2_KEY_ID: string().optional(),
  B2_APPLICATION_KEY: string().optional(),
  B2_READ_KEY_ID: string().optional(),
  B2_READ_APPLICATION_KEY: string().optional(),
});
