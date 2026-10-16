import { defineEnv, string } from 'void/env';

// Declare every environment key here and read it through `env` from 'void/env'.
export default defineEnv({
  AUTH_GOOGLE_CLIENT_ID: string(),
  AUTH_GOOGLE_CLIENT_SECRET: string(),
});
