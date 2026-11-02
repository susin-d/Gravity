import React from "react";
import ReactDOM from "react-dom/client";
import { initTauriShim } from "./lib/tauri-shim";
import App from "./App";
import "./index.css";

// Initialize browser preview shim if not running inside native Tauri runtime
initTauriShim();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
