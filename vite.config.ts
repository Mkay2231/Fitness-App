import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Shown in Settings, so you can tell which version a phone is running.
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
function commit() {
  // Vercel builds from a clone and provides the commit; locally, ask git.
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit()),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    // Caches the app files so it opens and logs workouts with no internet.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Rep Ledger',
        short_name: 'Rep Ledger',
        description: 'Personal training, food and progress log.',
        theme_color: '#14532d',
        background_color: '#0f1412',
        display: 'standalone',
        start_url: '/',
        // Generated from public/icon.svg with `npx pwa-assets-generator --preset minimal-2023 public/icon.svg`.
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Inter must be cached too, or the app falls back to system fonts offline.
        // Only the Latin subsets: they cover English and Yoruba/Igbo/Hausa letters with diacritics.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}', '**/inter-latin-wght-normal-*.woff2', '**/inter-latin-ext-wght-normal-*.woff2'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
