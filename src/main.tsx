import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Start with splash screen
if (window.location.pathname === '/') {
  window.location.href = '/splash';
}

createRoot(document.getElementById("root")!).render(<App />);
