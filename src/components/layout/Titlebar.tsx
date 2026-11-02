import { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  Minus,
  Square,
  X,
  Plus,
} from "lucide-react";

interface TitlebarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onNewSession?: () => void;
  autoSwitchArmed?: boolean;
  activeProfileName?: string;
  onSelectPage: (page: string) => void;
}

export default function Titlebar({
  sidebarOpen,
  onToggleSidebar,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  onNewSession,
  autoSwitchArmed = false,
  activeProfileName,
  onSelectPage,
}: TitlebarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleWindowAction = async (action: "minimize" | "maximize" | "close") => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      if (action === "minimize") await appWindow.minimize();
      if (action === "maximize") await appWindow.toggleMaximize();
      if (action === "close") await appWindow.close();
    } catch (error) {
      console.error(`Failed to ${action} Gravity window`, error);
    }
  };

  const handleTitlebarMouseDown = async (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch (error) {
      console.error("Failed to drag Gravity window", error);
    }
  };

  return (
    <header
      onMouseDown={handleTitlebarMouseDown}
      className="relative flex h-10 w-full select-none items-center justify-between border-b border-edge-subtle bg-[#0a0a0a] text-xs text-ink-mid z-40"
      style={{
        background: "rgba(10, 10, 10, 0.95)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* ── Left: Navigation, Sidebar Toggle, Menus ────────────────────────── */}
      <div className="flex items-center gap-1 px-2 z-10">
        <button
          type="button"
          onClick={onGoBack}
          disabled={!canGoBack}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            canGoBack
              ? "text-ink-high hover:bg-glass-2 hover:text-white"
              : "text-ink-ghost cursor-not-allowed"
          }`}
          title="Back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onGoForward}
          disabled={!canGoForward}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            canGoForward
              ? "text-ink-high hover:bg-glass-2 hover:text-white"
              : "text-ink-ghost cursor-not-allowed"
          }`}
          title="Forward"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-high hover:bg-glass-2 hover:text-white transition-colors ml-0.5"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-3.5 w-3.5" />
          ) : (
            <PanelLeft className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="h-3.5 w-[1px] bg-edge-subtle mx-1" />

        {/* Desktop Menus */}
        <div ref={menuRef} className="flex items-center gap-0.5 text-[11px]">
          {/* File Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
              className={`px-2 py-1 rounded transition-colors ${
                openMenu === "file" ? "bg-glass-3 text-white" : "hover:bg-glass-2 hover:text-white"
              }`}
            >
              File
            </button>
            {openMenu === "file" && (
              <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-edge-DEFAULT bg-[#121212] p-1 shadow-2xl z-50">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onNewSession?.();
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-ink-high hover:bg-glass-2 hover:text-white"
                >
                  <span>New Session</span>
                  <span className="text-[10px] text-ink-low font-mono">Ctrl+N</span>
                </button>
                <div className="my-1 border-t border-edge-subtle" />
                <button
                  type="button"
                  onClick={() => handleWindowAction("close")}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-red-400 hover:bg-red-500/10"
                >
                  <span>Exit Gravity</span>
                  <span className="text-[10px] text-red-400/70 font-mono">Alt+F4</span>
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "edit" ? null : "edit")}
              className={`px-2 py-1 rounded transition-colors ${
                openMenu === "edit" ? "bg-glass-3 text-white" : "hover:bg-glass-2 hover:text-white"
              }`}
            >
              Edit
            </button>
            {openMenu === "edit" && (
              <div className="absolute left-0 top-full mt-1 w-40 rounded-lg border border-edge-DEFAULT bg-[#121212] p-1 shadow-2xl z-50">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onSelectPage("settings");
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-ink-high hover:bg-glass-2 hover:text-white"
                >
                  <span>Preferences</span>
                </button>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "view" ? null : "view")}
              className={`px-2 py-1 rounded transition-colors ${
                openMenu === "view" ? "bg-glass-3 text-white" : "hover:bg-glass-2 hover:text-white"
              }`}
            >
              View
            </button>
            {openMenu === "view" && (
              <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-edge-DEFAULT bg-[#121212] p-1 shadow-2xl z-50">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onToggleSidebar();
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-ink-high hover:bg-glass-2 hover:text-white"
                >
                  <span>Toggle Sidebar</span>
                  <span className="text-[10px] text-ink-low font-mono">Ctrl+B</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onSelectPage("history");
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-ink-high hover:bg-glass-2 hover:text-white"
                >
                  <span>Switch History</span>
                </button>
              </div>
            )}
          </div>

          {/* Profiles Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "profiles" ? null : "profiles")}
              className={`px-2 py-1 rounded transition-colors ${
                openMenu === "profiles" ? "bg-glass-3 text-white" : "hover:bg-glass-2 hover:text-white"
              }`}
            >
              Profiles
            </button>
            {openMenu === "profiles" && (
              <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-edge-DEFAULT bg-[#121212] p-1 shadow-2xl z-50">
                <div className="px-2.5 py-1 text-[10px] text-ink-low uppercase tracking-wider font-semibold">
                  Active: {activeProfileName || "None"}
                </div>
                <div className="my-1 border-t border-edge-subtle" />
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onSelectPage("profiles");
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-ink-high hover:bg-glass-2 hover:text-white"
                >
                  <span>Manage Profiles</span>
                </button>
              </div>
            )}
          </div>

          {/* Help Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "help" ? null : "help")}
              className={`px-2 py-1 rounded transition-colors ${
                openMenu === "help" ? "bg-glass-3 text-white" : "hover:bg-glass-2 hover:text-white"
              }`}
            >
              Help
            </button>
            {openMenu === "help" && (
              <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-edge-DEFAULT bg-[#121212] p-1 shadow-2xl z-50">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onSelectPage("adapters");
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-ink-high hover:bg-glass-2 hover:text-white"
                >
                  <span>Adapter Health</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onSelectPage("settings");
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 rounded text-left text-ink-high hover:bg-glass-2 hover:text-white"
                >
                  <span>About Gravity</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Center: Draggable Window Region ───────────────────────────────── */}
      <div className="pointer-events-none absolute inset-y-0 left-[15%] right-[15%] z-0 flex items-center justify-center">
        <span className="text-[11px] font-medium tracking-wider text-ink-low pointer-events-none uppercase">
          Gravity
        </span>
      </div>

      {/* ── Right: Auto-Switch pill, New Session, Window Controls ─────────── */}
      <div className="relative z-10 flex items-center gap-1.5 pr-1">
        {autoSwitchArmed && (
          <div
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-blue-500/30 text-blue-400"
            style={{ background: "rgba(59, 130, 246, 0.12)" }}
          >
            <Sparkles className="h-2.5 w-2.5 text-blue-400" />
            <span>Auto-Switch Armed</span>
          </div>
        )}

        {onNewSession && (
          <button
            type="button"
            onClick={onNewSession}
            className="flex h-6 w-6 items-center justify-center rounded border border-edge-subtle bg-glass-1 text-ink-high hover:border-edge-DEFAULT hover:bg-glass-3 hover:text-white transition-colors"
            title="New Session"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}

        <div className="h-4 w-[1px] bg-edge-subtle mx-1" />

        {/* Window Controls */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => handleWindowAction("minimize")}
            className="flex h-7 w-9 items-center justify-center text-ink-mid hover:bg-glass-2 hover:text-white transition-colors"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleWindowAction("maximize")}
            className="flex h-7 w-9 items-center justify-center text-ink-mid hover:bg-glass-2 hover:text-white transition-colors"
            title="Maximize"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => handleWindowAction("close")}
            className="flex h-7 w-9 items-center justify-center text-ink-mid hover:bg-red-500/80 hover:text-white transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
