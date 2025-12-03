import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Import debug utilities (makes window.__debugAuth available)
import "@/utils/debugAuth";

// Import Capacitor initialization
import { initializeCapacitor, isNativeApp, getPlatform } from "@/utils/capacitorInit";

// Extend Window interface for React loaded flag
declare global {
  interface Window {
    __REACT_LOADED__?: boolean;
    __TENANT_LOADED__?: boolean;
    __TENANT_BRANDING__?: any;
  }
}

// Signal that React is loaded
window.__REACT_LOADED__ = true;

// Initialize Capacitor for native apps
if (isNativeApp()) {
  console.log('📱 [Capacitor] Running as native app on:', getPlatform());
  initializeCapacitor();
} else {
  console.log('🌐 [PWA] Running as web app');
}

// Update manifest link dynamically with tenant-specific manifest
const updateManifestLink = async () => {
  try {
    const manifestLink = document.getElementById('app-manifest') as HTMLLinkElement;
    if (manifestLink) {
      // Use Supabase edge function for dynamic tenant manifest
      const supabaseUrl = 'https://qfklkkzxemsbeniyugiz.supabase.co';
      const domain = window.location.hostname;
      manifestLink.href = `${supabaseUrl}/functions/v1/generate-manifest?domain=${encodeURIComponent(domain)}`;
      console.log('📱 [PWA] Dynamic manifest loaded:', manifestLink.href);
      console.log('📱 [PWA] Domain:', domain);
    }
  } catch (error) {
    console.error('❌ [PWA] Failed to update manifest:', error);
  }
};

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

// Update manifest and register SW on load
updateManifestLink();
window.addEventListener('load', () => {
  registerServiceWorker();
});

const rootElement = document.getElementById("root")!;

// Signal that React is mounting (loader removal is handled by index.html event listener)
createRoot(rootElement).render(<App />);
