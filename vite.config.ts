import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
