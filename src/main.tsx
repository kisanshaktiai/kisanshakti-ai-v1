import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Import debug utilities (makes window.__debugAuth available)
import "@/utils/debugAuth";

// Extend Window interface for React loaded flag
declare global {
  interface Window {
    __REACT_LOADED__?: boolean;
    __removeHtmlLoader?: () => void;
  }
}

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

// Provide HTML loader removal function to React components
window.__removeHtmlLoader = () => {
  const loader = document.getElementById('ks-main-loader');
  if (loader) {
    console.log('✅ Removing HTML loader');
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 500);
  }
};

// Render React app
createRoot(rootElement).render(<App />);

// Signal that React has loaded successfully
requestAnimationFrame(() => {
  window.__REACT_LOADED__ = true;
  window.dispatchEvent(new Event('__REACT_LOADED__'));
  console.log('✅ React loaded successfully');
});
