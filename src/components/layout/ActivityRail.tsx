import React from "react";
import {
  Home,
  Clock,
  Users,
  Activity,
  Settings as SettingsIcon,
  Zap,
} from "lucide-react";

export type NavTab = "workspace" | "history" | "profiles" | "adapters" | "autoswitch" | "settings";

interface ActivityRailProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  autoSwitchFlag: boolean;
  activeProfileInitials?: string;
  activeProfileName?: string;
  activeProfileVendor?: "claude" | "codex";
}

export default function ActivityRail({
  activeTab,
  onSelectTab,
  autoSwitchFlag,
  activeProfileInitials = "SR",
  activeProfileName,
  activeProfileVendor,
}: ActivityRailProps) {
  const navItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "workspace", label: "Workspace", icon: Home },
    { id: "history", label: "History", icon: Clock },
    { id: "profiles", label: "Profiles", icon: Users },
    { id: "adapters", label: "Adapter Health", icon: Activity },
    ...(autoSwitchFlag ? [{ id: "autoswitch" as NavTab, label: "Auto-Switch", icon: Zap }] : []),
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <aside
      className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-edge-subtle bg-[#0a0a0a] py-3 z-30 select-none"
      style={{
        background: "rgba(10, 10, 10, 0.98)",
      }}
    >
      {/* ── Top Rail Navigation Icons ───────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              title={label}
              className={`group relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150 ${
                isActive
                  ? "bg-white text-black shadow-glow"
                  : "text-ink-low hover:bg-glass-2 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />

              {/* Tooltip on hover */}
              <span className="pointer-events-none absolute left-12 whitespace-nowrap rounded-md border border-edge-DEFAULT bg-[#141414] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 z-50">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Bottom: Active Profile Avatar ──────────────────────────────────── */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => onSelectTab("profiles")}
          title={`Active Profile: ${activeProfileName || "None"}`}
          className="group relative flex h-8 w-8 items-center justify-center rounded-full border border-edge-subtle bg-glass-2 text-[11px] font-semibold text-ink-high hover:border-edge-DEFAULT hover:text-white transition-colors"
        >
          {activeProfileInitials}

          {/* Provider indicator badge */}
          {activeProfileVendor && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-black ${
                activeProfileVendor === "claude" ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
          )}

          {/* Profile Name Tooltip */}
          <span className="pointer-events-none absolute left-12 whitespace-nowrap rounded-md border border-edge-DEFAULT bg-[#141414] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 z-50">
            {activeProfileName || "No Profile Selected"}
          </span>
        </button>
      </div>
    </aside>
  );
}
