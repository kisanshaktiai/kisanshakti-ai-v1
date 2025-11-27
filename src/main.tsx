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
      // Use edge function for dynamic tenant manifest
      const origin = window.location.origin;
      manifestLink.href = `${origin}/.netlify/functions/generate-manifest`;
      console.log('📱 Dynamic manifest loaded:', manifestLink.href);
    }
  } catch (error) {
    console.error('Failed to update manifest:', error);
  }
};

// Update manifest on load
updateManifestLink();

const rootElement = document.getElementById("root")!;

// Signal that React is mounting (loader removal is handled by index.html event listener)
createRoot(rootElement).render(<App />);
