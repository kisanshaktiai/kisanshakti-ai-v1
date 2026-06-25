import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// =============================================================================
// Global chunk-load error recovery — fixes "Importing a module script failed"
// after a new deploy (stale index.html referencing missing hashed chunks).
// One-shot reload guarded by sessionStorage so we never enter a loop.
// =============================================================================
(() => {
  const RELOAD_KEY = '__chunk_reload_attempted__';
  const isChunkErr = (msg: string) =>
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [^\s]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /ChunkLoadError/i.test(msg);

  const recover = async (reason: string) => {
    console.warn('🔄 [ChunkRecovery] Triggered by:', reason);
    if (sessionStorage.getItem(RELOAD_KEY)) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch {/* ignore */}
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString(36));
    window.location.replace(url.toString());
  };

  window.addEventListener('error', (event) => {
    const msg = event?.message || (event?.error && (event.error.message || String(event.error))) || '';
    if (isChunkErr(msg)) {
      recover(msg);
    } else {
      // Sprint 6: forward non-chunk runtime errors to telemetry (best-effort)
      import('@/lib/observability')
        .then(({ reportError }) => reportError(event?.error ?? msg, { source: 'window.onerror' }))
        .catch(() => {});
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event?.reason;
    const msg = (reason && (reason.message || String(reason))) || '';
    if (isChunkErr(msg)) {
      recover(msg);
    } else {
      import('@/lib/observability')
        .then(({ reportError }) => reportError(reason ?? msg, { source: 'unhandledrejection' }))
        .catch(() => {});
    }
  });

  // After a successful page-load that wasn't itself a chunk-error reload, clear guard.
  window.addEventListener('load', () => {
    setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 5000);
    // Initialize telemetry batching
    import('@/lib/observability').then(({ initObservability }) => initObservability()).catch(() => {});
  });
})();


// Import Capacitor initialization
import { initializeCapacitor, isNativeApp, getPlatform } from "@/utils/capacitorInit";

// Extend Window interface for React loaded flag and PWA prompt
declare global {
  interface Window {
    __REACT_LOADED__?: boolean;
    __TENANT_LOADED__?: boolean;
    __TENANT_BRANDING__?: any;
    __capturedPwaPrompt?: any;
    __pwaPromptCapturedAt?: number;
    __pwaPromptUsed?: boolean;
  }
}

// =============================================================================
// CRITICAL PWA FIX: Capture beforeinstallprompt IMMEDIATELY before React loads
// This event fires ONCE and is lost if not captured synchronously.
// Moving this to main.tsx ensures we capture it before any React code runs.
// =============================================================================
console.log('🚀 [PWA] main.tsx executing - setting up beforeinstallprompt listener');

// Capture the event IMMEDIATELY - before React renders
window.addEventListener('beforeinstallprompt', (e: Event) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  
  // Store the event for later use
  window.__capturedPwaPrompt = e;
  window.__pwaPromptCapturedAt = Date.now();
  window.__pwaPromptUsed = false;
  
  console.log('✅ [PWA] beforeinstallprompt CAPTURED in main.tsx (before React)!');
  console.log('📋 [PWA] Event stored at:', new Date().toISOString());
  
  // Dispatch custom event for any React components that are already mounted
  window.dispatchEvent(new CustomEvent('pwa-prompt-captured', { detail: e }));
});

// Also listen for app installed
window.addEventListener('appinstalled', () => {
  console.log('🎉 [PWA] App was installed successfully!');
  window.__capturedPwaPrompt = null;
  window.__pwaPromptUsed = true;
});

// Signal that React is loaded
window.__REACT_LOADED__ = true;

// Initialize Capacitor for native apps
if (isNativeApp()) {
  console.log('📱 [Capacitor] Running as native app on:', getPlatform());
  initializeCapacitor();
} else {
  console.log('🌐 [PWA] Running as web app');
}

// REMOVED: Dynamic manifest generation - causes 429 rate limiting errors
// Using static /manifest.json only for PWA installability
// Tenant branding is loaded separately via TenantContext
console.log('📱 [PWA] Using static manifest.json (no dynamic API calls)');

// Explicit Service Worker Registration - Single source of truth
// IMPORTANT: do NOT register in dev, inside an iframe, or on Lovable
// preview/sandbox hosts. The app SW caches GET responses including the
// Vite dev modules, which breaks the Lovable preview (white screen / stale
// bundles after a reload). For returning visitors on those hosts we also
// proactively unregister any previously-installed app SW.
const shouldSkipServiceWorker = () => {
  try {
    if (!import.meta.env.PROD) return true;
    if (window.top !== window.self) return true; // inside iframe (Lovable preview)
    const host = window.location.hostname;
    if (
      host.startsWith('id-preview--') ||
      host.startsWith('preview--') ||
      host === 'lovableproject.com' || host.endsWith('.lovableproject.com') ||
      host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com') ||
      host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')
    ) return true;
    if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;
  } catch {
    return true;
  }
  return false;
};

const unregisterAppServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url =
        reg.active?.scriptURL ||
        reg.installing?.scriptURL ||
        reg.waiting?.scriptURL ||
        '';
      // Only touch our own app-shell SW; leave messaging workers (FCM/OneSignal) alone.
      if (url.endsWith('/sw.js') || url.endsWith('/service-worker.js')) {
        console.log('🗑️ [PWA] Unregistering app SW:', url);
        await reg.unregister();
      }
    }
  } catch (e) {
    console.warn('[PWA] unregister failed', e);
  }
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ [PWA] Service Worker not supported');
    return;
  }
  if (shouldSkipServiceWorker()) {
    console.log('🚫 [PWA] Skipping SW registration (dev/preview/iframe)');
    await unregisterAppServiceWorkers();
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });
    console.log('✅ [PWA] Service Worker registered:', registration.scope);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('pwa-update-available'));
          }
        });
      }
    });
  } catch (error) {
    console.error('❌ [PWA] Service Worker registration failed:', error);
  }
};

console.log('🔧 [PWA] SW supported:', 'serviceWorker' in navigator);

// Register SW on load (no dynamic manifest calls)
window.addEventListener('load', () => {
  registerServiceWorker();
});

if (import.meta.env.DEV) {
  setTimeout(() => {
    import("@/utils/debugAuth").catch(() => null);
  }, 4000);
}

const rootElement = document.getElementById("root")!;

// Wait for the initial language's page-bundles (home/weather/common/...) to load
// BEFORE first paint. This prevents the "translation key flash" where users
// momentarily see raw keys like `home.welcome` until the JSON chunk arrives.
import("@/i18n/config").then(({ i18nReady }) => {
  i18nReady.finally(() => {
    createRoot(rootElement).render(<App />);
  });
});
