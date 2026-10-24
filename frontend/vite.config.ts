/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The Library API: the Node dev server (apps/api) or the CodeIgniter backend, same routes.
  const target = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8787';
  const proxy = Object.fromEntries(['/api', '/feed', '/previews'].map((p) => [p, { target, changeOrigin: false }]));

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) return 'vendor-react';
            if (id.includes('node_modules/@headlessui') || id.includes('node_modules/@floating-ui') || id.includes('node_modules/@react-aria')) return 'vendor-ui';
            return undefined;
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
