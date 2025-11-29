import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Import debug utilities (makes window.__debugAuth available)
import "@/utils/debugAuth";

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

// Explicit Service Worker Registration
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { 
        scope: '/' 
      });
      console.log('✅ [PWA] Service Worker registered:', registration.scope);
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        console.log('🔄 [PWA] Service Worker update found');
      });
    } catch (error) {
      console.error('❌ [PWA] Service Worker registration failed:', error);
    }
  } else {
    console.warn('⚠️ [PWA] Service Worker not supported');
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
