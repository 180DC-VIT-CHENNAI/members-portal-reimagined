import react from '@vitejs/plugin-react';
import { voidPlugin } from 'void';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // PORTAL_STATE_DIR lets the e2e suite run against a fresh local database.
    voidPlugin(process.env.PORTAL_STATE_DIR ? { persistTo: process.env.PORTAL_STATE_DIR } : {}),
    react(),
  ],
});
