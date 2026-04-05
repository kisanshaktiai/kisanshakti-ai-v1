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
        manualChunks: {
          // Core React bundle
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI components - split for better caching
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tooltip', '@radix-ui/react-checkbox', '@radix-ui/react-radio-group', '@radix-ui/react-switch', '@radix-ui/react-slider'],
          // PERFORMANCE: Separate heavy libraries into their own chunks
          'framer-motion': ['framer-motion'],
          'date-fns': ['date-fns'],
          'i18next': ['i18next', 'react-i18next'],
          'lucide': ['lucide-react'],
          // Map and chart libraries
          'map-vendor': ['@react-google-maps/api', '@turf/turf'],
          'chart-vendor': ['chart.js', 'react-chartjs-2', 'recharts'],
          // Backend/data
          'supabase': ['@supabase/supabase-js'],
          'tanstack': ['@tanstack/react-query'],
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
        navigateFallbackDenylist: [/^\/api/, /supabase/],
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
