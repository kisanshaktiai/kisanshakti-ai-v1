import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
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
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'map-vendor': ['@react-google-maps/api', '@turf/turf'],
          'chart-vendor': ['chart.js', 'react-chartjs-2', 'recharts'],
          'supabase': ['@supabase/supabase-js'],
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
      // CRITICAL: Use static manifest.json from public/ folder
      // This ensures browser can validate PWA installability
      manifestFilename: 'manifest.json',
      strategies: 'generateSW',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        // Skip external URLs to avoid CORS issues
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
      includeAssets: ['favicon.ico', 'icon-192x192.png', 'icon-512x512.png', '.htaccess', '_redirects'],
      // CRITICAL: false = use static manifest.json from public/ folder
      // This is required for PWA installability - browser needs valid manifest
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
