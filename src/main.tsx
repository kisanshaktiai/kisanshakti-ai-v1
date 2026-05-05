import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ [PWA] Service Worker not supported');
    return;
  }

  try {
    // Unregister any old service workers first
    const existingRegistrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of existingRegistrations) {
      if (reg.active?.scriptURL && !reg.active.scriptURL.endsWith('/sw.js')) {
        console.log('🗑️ [PWA] Unregistering old SW:', reg.active.scriptURL);
        await reg.unregister();
      }
    }

    const registration = await navigator.serviceWorker.register('/sw.js', { 
      scope: '/',
      updateViaCache: 'none' // Always fetch fresh SW
    });
    
    console.log('✅ [PWA] Service Worker registered:', registration.scope);
    console.log('📊 [PWA] SW State:', {
      installing: !!registration.installing,
      waiting: !!registration.waiting,
      active: !!registration.active
    });
    
    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('🔄 [PWA] New Service Worker installing...');
      
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          console.log('📊 [PWA] SW state changed:', newWorker.state);
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('✨ [PWA] New version available!');
            window.dispatchEvent(new CustomEvent('pwa-update-available'));
          }
        });
      }
    });
  } catch (error) {
    console.error('❌ [PWA] Service Worker registration failed:', error);
  }
};

// PWA Debug Logging
console.log('🔧 [PWA] Checking PWA installability...');
console.log('🔧 [PWA] SW supported:', 'serviceWorker' in navigator);
console.log('🔧 [PWA] beforeinstallprompt supported:', 'onbeforeinstallprompt' in window);

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

// Signal that React is mounting (loader removal is handled by index.html event listener)
createRoot(rootElement).render(<App />);
