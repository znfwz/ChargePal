import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version?: string };
const appVersion = packageJson.version ?? '0.0.0';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: [
            'icons/icon-16x16.png',
            'icons/icon-32x32.png',
            'icons/apple-touch-icon.png',
            'icons/icon-192x192.png',
            'icons/icon-512x512.png',
            'icons/icon-maskable-512x512.png',
          ],
          manifest: {
            name: '充小助',
            short_name: '充小助',
            description: '智能新能源汽车充电管理系统',
            theme_color: '#10b981',
            background_color: '#ffffff',
            display: 'standalone',
            start_url: '/',
            scope: '/',
            icons: [
              {
                src: '/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/icons/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/icons/icon-maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          workbox: {
            cleanupOutdatedCaches: true,
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
            runtimeCaching: [
              {
                urlPattern: ({ request }) => request.destination === 'document',
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'html-cache',
                  networkTimeoutSeconds: 3,
                  expiration: {
                    maxEntries: 20,
                    maxAgeSeconds: 60 * 60,
                  },
                },
              },
              {
                urlPattern: ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
                handler: 'CacheFirst',
                options: {
                  cacheName: 'asset-cache',
                  expiration: {
                    maxEntries: 80,
                    maxAgeSeconds: 60 * 60 * 24 * 7,
                  },
                },
              },
              {
                urlPattern: ({ request }) => ['image', 'font'].includes(request.destination),
                handler: 'CacheFirst',
                options: {
                  cacheName: 'media-cache',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24 * 30,
                  },
                },
              },
              {
                urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/i,
                handler: 'NetworkOnly',
              },
              {
                urlPattern: /\/api\/.*/i,
                handler: 'NetworkOnly',
              },
            ],
          },
          devOptions: {
            enabled: true,
          },
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        __APP_VERSION__: JSON.stringify(appVersion)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
