import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { productTextGuard } from './scripts/product-text-guard.js';

export default defineConfig({
  plugins: [productTextGuard(), react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
