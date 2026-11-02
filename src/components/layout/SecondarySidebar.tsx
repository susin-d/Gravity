import { NavTab } from "./ActivityRail";
import { Project } from "../../pages/Projects";
import { Profile } from "../../pages/Profiles";
import { UsageReading } from "../UsageBadge";
import WorkspacePanel from "./panels/WorkspacePanel";
import ProjectsPanel from "./panels/ProjectsPanel";
import ProfilesPanel from "./panels/ProfilesPanel";
import HistoryPanel from "./panels/HistoryPanel";
import AdaptersPanel from "./panels/AdaptersPanel";
import SettingsPanel, { SettingsSection } from "./panels/SettingsPanel";

interface SecondarySidebarProps {
  isOpen: boolean;
  activeTab: NavTab;
  projects: Project[];
  profiles: Profile[];
  usages?: Record<string, UsageReading>;
  activeProjectId: string | null;
  activeProfileId: string | null;
  selectedEventId: string | null;
  selectedAdapter: "claude" | "codex" | null;
  selectedSettingsSection: SettingsSection;
  autoSwitchFlag: boolean;
  onSelectProject: (id: string) => void;
  onSelectProfile: (id: string) => void;
  onSelectEvent: (id: string) => void;
  onSelectAdapter: (adapter: "claude" | "codex") => void;
  onSelectSettingsSection: (section: SettingsSection) => void;
  onNewSession: () => void;
  onOpenCreateProject?: () => void;
}

export default function SecondarySidebar({
  isOpen,
  activeTab,
  projects,
  profiles,
  usages = {},
  activeProjectId,
  activeProfileId,
  selectedEventId,
  selectedAdapter,
  selectedSettingsSection,
  autoSwitchFlag,
  onSelectProject,
  onSelectProfile,
  onSelectEvent,
  onSelectAdapter,
  onSelectSettingsSection,
  onNewSession,
  onOpenCreateProject,
}: SecondarySidebarProps) {
  if (!isOpen) return null;

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r border-edge-subtle bg-[#0e0e0e] text-xs text-ink-mid z-20 select-none transition-all duration-200"
      style={{
        background: "rgba(14, 14, 14, 0.96)",
      }}
    >
      {activeTab === "workspace" && (
        <WorkspacePanel
          projects={projects}
          profiles={profiles}
          activeProjectId={activeProjectId}
          activeProfileId={activeProfileId}
          onSelectProject={onSelectProject}
          onSelectProfile={onSelectProfile}
          onNewSession={onNewSession}
          onOpenCreateProject={onOpenCreateProject}
        />
      )}

      {activeTab === "projects" && (
        <ProjectsPanel
          projects={projects}
          selectedProjectId={activeProjectId}
          onSelectProject={onSelectProject}
          onOpenCreateProject={onOpenCreateProject}
        />
      )}

      {activeTab === "profiles" && (
        <ProfilesPanel
          profiles={profiles}
          usages={usages}
          selectedProfileId={activeProfileId}
          onSelectProfile={onSelectProfile}
        />
      )}

      {activeTab === "history" && (
        <HistoryPanel
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
        />
      )}

      {activeTab === "adapters" && (
        <AdaptersPanel
          selectedAdapter={selectedAdapter}
          onSelectAdapter={onSelectAdapter}
        />
      )}

      {activeTab === "settings" && (
        <SettingsPanel
          selectedSection={selectedSettingsSection}
          onSelectSection={onSelectSettingsSection}
          autoSwitchFlag={autoSwitchFlag}
        />
      )}

      {activeTab === "autoswitch" && (
        <div className="flex h-full flex-col p-4 text-ink-low text-center justify-center">
          <p className="text-xs text-white font-medium">Auto-Switch Engine</p>
          <p className="mt-1 text-[11px]">Gated by flags.toml</p>
        </div>
      )}
    </aside>
  );
}
