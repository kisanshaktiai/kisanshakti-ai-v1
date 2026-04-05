import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// Get version from package.json or use default
const APP_VERSION = process.env.npm_package_version || '1.0.0';
const BUILD_TIMESTAMP = new Date().toISOString();

// Generate unique build hash for every deploy (timestamp + random string)
// This ensures automatic cache invalidation on every deployment
const BUILD_HASH = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
    'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(BUILD_TIMESTAMP),
    'import.meta.env.VITE_BUILD_HASH': JSON.stringify(BUILD_HASH),
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Route UI form wrapper components into ui-vendor to prevent circular chunks
          // These files import BOTH @radix-ui/* AND lucide-react, causing Rollup to
          // create a phantom "ui-forms" chunk that cross-references both
          if (id.includes('src/components/ui/checkbox') ||
              id.includes('src/components/ui/radio-group') ||
              id.includes('src/components/ui/switch') ||
              id.includes('src/components/ui/slider')) return 'ui-vendor';
          // ALL Radix UI into one chunk
          if (id.includes('@radix-ui/')) return 'ui-vendor';
          // Core React
          if (id.includes('react-dom') || id.includes('react-router-dom')) return 'react-vendor';
          // Heavy libs
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('date-fns')) return 'date-fns';
          if (id.includes('i18next') || id.includes('react-i18next')) return 'i18next';
          if (id.includes('lucide-react')) return 'lucide';
          if (id.includes('@react-google-maps') || id.includes('@turf/')) return 'map-vendor';
          if (id.includes('chart.js') || id.includes('react-chartjs-2') || id.includes('recharts')) return 'chart-vendor';
          if (id.includes('@supabase/')) return 'supabase';
          if (id.includes('@tanstack/react-query')) return 'tanstack';
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'prompt',
      filename: 'sw.js',
      // CRITICAL: Prevent auto-injection of registerSW.js - we handle it in main.tsx
      injectRegister: false,
      // CRITICAL: Use static manifest.json from public/ folder
      manifestFilename: 'manifest.json',
      strategies: 'generateSW',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api/, /supabase/, /^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }
            }
          }
        ]
      },
      // CRITICAL: Only include actual app assets - NOT server config files (.htaccess returns 403)
      includeAssets: ['favicon.ico', 'icon-192x192.png', 'icon-512x512.png'],
      // CRITICAL: false = use static manifest.json from public/ folder
      manifest: false,
      devOptions: {
        enabled: false,
        type: 'module',
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
