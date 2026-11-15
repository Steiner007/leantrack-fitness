import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const artifact = process.env.VITE_TARGET === 'artifact'

export default defineConfig({
  // The hosted Claude-artifact build uses relative asset paths and no service worker.
  base: artifact ? './' : '/',
  build: { outDir: artifact ? 'dist-artifact' : 'dist' },
  plugins: [
    react(),
    VitePWA({
      disable: artifact,
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LeanTrack',
        short_name: 'LeanTrack',
        description: '12-week fat-loss and recomposition tracker',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Never cache Supabase API or signed photo URLs: private data stays out of the SW cache.
        runtimeCaching: [],
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
})
