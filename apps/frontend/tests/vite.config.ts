import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Dedicated fixture server: no production API proxy or account keys.
export default defineConfig({ plugins: [react()], define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://127.0.0.1:4177') }, server: { strictPort: true }, build: { outDir: 'test-dist' } });
