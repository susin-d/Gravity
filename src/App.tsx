import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderGit2,
  Users,
  Activity,
  Zap,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Orbit,
} from "lucide-react";
import Settings from "./pages/Settings";
import Profiles from "./pages/Profiles";
import Projects from "./pages/Projects";
import AdapterHealth from "./pages/AdapterHealth";
import AutoSwitchConsent from "./pages/AutoSwitchConsent";
import History from "./pages/History";

type Page = "projects" | "profiles" | "adapters" | "autoswitch" | "settings" | "history";

interface AppSettings {
  flags: { auto_switch: boolean };
}

interface NavItemConfig {
  id: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItemConfig[] = [
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "adapters", label: "Adapters", icon: Activity },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function App() {
  const [page, setPage] = useState<Page>("projects");
  const [version, setVersion] = useState("");
  const [autoSwitchFlag, setAutoSwitchFlag] = useState(false);

  useEffect(() => {
    invoke<string>("get_version").then(setVersion).catch(() => {});
    invoke<AppSettings>("get_settings")
      .then((s) => setAutoSwitchFlag(s.flags.auto_switch))
      .catch(() => {});
  }, []);

  const visibleNav: NavItemConfig[] = autoSwitchFlag
    ? [
        ...NAV.slice(0, 3),
        { id: "autoswitch" as Page, label: "Auto-Switch", icon: Zap },
        ...NAV.slice(3),
      ]
    : NAV;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      {/* ── Sidebar ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border-subtle bg-surface-1">
        {/* Wordmark / drag region */}
        <div
          className="flex items-center gap-2.5 px-4 py-[14px]"
          data-tauri-drag-region
        >
          <div className="p-1.5 rounded-lg bg-gravity-600/15 text-gravity-400 border border-gravity-600/20">
            <Orbit className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold tracking-tight text-text-primary leading-none">
              Gravity
            </span>
            {version && (
              <span className="mt-0.5 text-[10px] text-text-tertiary font-mono leading-none">
                v{version}
              </span>
            )}
          </div>
        </div>

        <div className="divider" />

        {/* Nav items */}
        <nav className="flex-1 space-y-1 px-2.5 py-3">
          {visibleNav.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={[
                  "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-150",
                  active
                    ? "bg-gravity-600/15 text-gravity-300"
                    : "text-text-secondary hover:bg-surface-3 hover:text-text-primary",
                ].join(" ")}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-gravity-400" : "text-text-tertiary"}`} />
                <span>{label}</span>
                {active && (
                  <motion.span
                    layoutId="active-indicator"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-gravity-400"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom strip */}
        <div className="divider" />
        <div className="px-4 py-3 flex items-center justify-between text-[11px] text-text-tertiary">
          <span>AI CLI Navigator</span>
          <span className="font-mono text-[10px]">Win32</span>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {page === "projects" && <Projects />}
            {page === "profiles" && <Profiles />}
            {page === "adapters" && <AdapterHealth />}
            {page === "autoswitch" && <AutoSwitchConsent />}
            {page === "settings" && <Settings />}
            {page === "history" && <History />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
