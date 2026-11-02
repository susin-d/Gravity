import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Settings from "./pages/Settings";

type Page = "settings" | "profiles" | "projects" | "history";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("settings");
  const [appVersion, setAppVersion] = useState<string>("");

  const handleGetVersion = async () => {
    try {
      const version = await invoke<string>("get_version");
      setAppVersion(version);
    } catch (e) {
      console.error("Failed to get version:", e);
    }
  };

  // Fetch version on mount
  if (!appVersion) {
    handleGetVersion();
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800" data-tauri-drag-region>
          <h1 className="text-lg font-bold text-gravity-400 tracking-tight">
            Gravity
          </h1>
          {appVersion && (
            <span className="text-xs text-gray-500">v{appVersion}</span>
          )}
        </div>

        <div className="flex-1 py-2">
          <NavItem
            label="Settings"
            active={currentPage === "settings"}
            onClick={() => setCurrentPage("settings")}
          />
          <NavItem
            label="Profiles"
            active={currentPage === "profiles"}
            onClick={() => setCurrentPage("profiles")}
            disabled
          />
          <NavItem
            label="Projects"
            active={currentPage === "projects"}
            onClick={() => setCurrentPage("projects")}
            disabled
          />
          <NavItem
            label="History"
            active={currentPage === "history"}
            onClick={() => setCurrentPage("history")}
            disabled
          />
        </div>

        <div className="p-3 border-t border-gray-800 text-xs text-gray-600">
          M0 — Skeleton
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {currentPage === "settings" && <Settings />}
        {currentPage === "profiles" && (
          <Placeholder title="Profiles" milestone="M1" />
        )}
        {currentPage === "projects" && (
          <Placeholder title="Projects" milestone="M2" />
        )}
        {currentPage === "history" && (
          <Placeholder title="History" milestone="M7" />
        )}
      </main>
    </div>
  );
}

function NavItem({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
        active
          ? "bg-gray-800 text-gravity-400 border-l-2 border-gravity-500"
          : disabled
            ? "text-gray-700 cursor-not-allowed"
            : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
      }`}
    >
      {label}
      {disabled && (
        <span className="ml-2 text-[10px] text-gray-700 uppercase">soon</span>
      )}
    </button>
  );
}

function Placeholder({
  title,
  milestone,
}: {
  title: string;
  milestone: string;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-600">{title}</h2>
        <p className="mt-2 text-sm text-gray-700">
          Coming in {milestone}
        </p>
      </div>
    </div>
  );
}

export default App;
