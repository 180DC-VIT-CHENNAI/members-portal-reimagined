import { defineEnv, string } from 'void/env';

// Declare every environment key here and read it through `env` from 'void/env'.
export default defineEnv({
  AUTH_GOOGLE_CLIENT_ID: string(),
  AUTH_GOOGLE_CLIENT_SECRET: string(),
  // Optional Backblaze B2 failover for the R2 buckets (src/server/buckets.ts).
  // Without the first four, files live in R2 only.
  B2_S3_ENDPOINT: string().optional(),
  B2_BUCKET: string().optional(),
  B2_KEY_ID: string().optional(),
  B2_APPLICATION_KEY: string().optional(),
  B2_READ_KEY_ID: string().optional(),
  B2_READ_APPLICATION_KEY: string().optional(),
});
