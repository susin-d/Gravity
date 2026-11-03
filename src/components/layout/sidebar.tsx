import {
  Activity,
  FolderKanban,
  MessageSquare,
  Settings as SettingsIcon,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { PageId } from "../../lib/navigation";

interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "activity", label: "Activity", icon: Activity },
];

const settingsItem: NavItem = {
  id: "settings",
  label: "Settings",
  icon: SettingsIcon,
};

export interface SidebarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  runningCount: number;
  autoSwitchEnabled: boolean;
}

function NavButton({
  item: { id, label, icon: Icon },
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(id)}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "flex w-full items-center gap-3 rounded px-2.5 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
        "max-[900px]:justify-center max-[900px]:px-0",
        active
          ? "bg-raised font-medium text-ink"
          : "text-ink-muted hover:bg-raised/60 hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="max-[900px]:hidden">{label}</span>
    </button>
  );
}

export function Sidebar({
  page,
  onNavigate,
  runningCount,
  autoSwitchEnabled,
}: SidebarProps) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel max-[900px]:w-16">
      <nav aria-label="Primary" className="flex-1 space-y-0.5 p-2">
        {items.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={item.id === page}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {(runningCount > 0 || autoSwitchEnabled) && (
        <div className="space-y-1 border-t border-line p-2">
          {runningCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("chat")}
              title={`${runningCount} running session${runningCount === 1 ? "" : "s"}`}
              className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-xs text-ink-muted transition-colors hover:bg-raised/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 max-[900px]:justify-center max-[900px]:px-0"
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success"
              />
              <span className="max-[900px]:hidden">
                {runningCount} running session{runningCount === 1 ? "" : "s"}
              </span>
            </button>
          )}

          {autoSwitchEnabled && (
            <div
              title="Auto-switch is enabled in flags.toml"
              className="flex items-center gap-3 rounded px-2.5 py-2 text-xs text-ink-dim max-[900px]:justify-center max-[900px]:px-0"
            >
              <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="max-[900px]:hidden">Auto-switch enabled</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-line p-2">
        <NavButton
          item={settingsItem}
          active={page === settingsItem.id}
          onNavigate={onNavigate}
        />
      </div>
    </aside>
  );
}
