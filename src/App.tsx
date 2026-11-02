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
  { id: "projects",  label: "Projects",  icon: FolderGit2  },
  { id: "profiles",  label: "Profiles",  icon: Users       },
  { id: "adapters",  label: "Adapters",  icon: Activity    },
  { id: "history",   label: "History",   icon: HistoryIcon },
  { id: "settings",  label: "Settings",  icon: SettingsIcon },
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
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a]"
         style={{ backgroundImage: "radial-gradient(ellipse at 50% 38%, #131313 0%, #060606 68%)" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="flex w-52 shrink-0 flex-col border-r border-edge-subtle"
        style={{
          background: "rgba(5, 5, 5, 0.75)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
        }}
      >
        {/* Wordmark / drag region */}
        <div
          className="flex items-center gap-2.5 px-4 py-[14px]"
          data-tauri-drag-region
        >
          <div
            className="p-1.5 rounded-lg border border-edge-subtle text-white"
            style={{ background: "rgba(255,255,255,0.09)" }}
          >
            <Orbit className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold tracking-tight text-white leading-none">
              Gravity
            </span>
            {version && (
              <span className="mt-0.5 text-[10px] text-ink-low font-mono leading-none">
                v{version}
              </span>
            )}
          </div>
        </div>

        <div className="divider" />

        {/* Nav items */}
        <nav className="flex-1 space-y-0.5 px-2.5 py-3">
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
                    ? "text-white"
                    : "text-ink-mid hover:text-white hover:bg-glass-2",
                ].join(" ")}
                style={active ? {
                  background: "rgba(255,255,255,0.10)",
                  boxShadow: "0 0 20px rgba(255,255,255,0.10), 0 1px 0 rgba(255,255,255,0.06) inset",
                  border: "1px solid rgba(255,255,255,0.12)",
                } : {}}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-ink-low"}`}
                />
                <span>{label}</span>
                {active && (
                  <motion.span
                    layoutId="active-indicator"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-white"
                    style={{ boxShadow: "0 0 6px rgba(255,255,255,0.80)" }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom strip */}
        <div className="divider" />
        <div className="px-4 py-3 flex items-center justify-between text-[11px] text-ink-low">
          <span>AI CLI Navigator</span>
          <span className="font-mono text-[10px]">Win32</span>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {page === "projects"   && <Projects />}
            {page === "profiles"   && <Profiles />}
            {page === "adapters"   && <AdapterHealth />}
            {page === "autoswitch" && <AutoSwitchConsent />}
            {page === "settings"   && <Settings />}
            {page === "history"    && <History />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
