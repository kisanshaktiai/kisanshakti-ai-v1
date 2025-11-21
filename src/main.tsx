import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Import debug utilities (makes window.__debugAuth available)
import "@/utils/debugAuth";

// Extend Window interface for React loaded flag
declare global {
  interface Window {
    __REACT_LOADED__?: boolean;
  }
}

// Signal that React is loaded
window.__REACT_LOADED__ = true;

const rootElement = document.getElementById("root")!;

// Remove initial loader when React is ready
const removeInitialLoader = () => {
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.transition = 'opacity 0.3s ease-out';
    setTimeout(() => loader.remove(), 300);
  }
};

createRoot(rootElement).render(<App />);

// Remove loader after first paint
requestAnimationFrame(() => {
  setTimeout(removeInitialLoader, 100);
});
