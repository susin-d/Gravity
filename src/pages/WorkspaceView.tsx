import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "./Projects";
import { Profile, Session } from "./Profiles";
import { UsageReading } from "../components/UsageBadge";
import ProjectHero from "../components/workspace/ProjectHero";
import DockedLauncher from "../components/layout/DockedLauncher";

interface WorkspaceViewProps {
  activeProject: Project | null;
  activeProfile: Profile | null;
  profiles: Profile[];
  usageReading?: UsageReading | null;
  activeSessions: Session[];
  onSelectProfile: (id: string) => void;
  onOpenCreateProject?: () => void;
  onSelectProjectName?: () => void;
  onSessionSpawned?: (session: Session) => void;
}

export default function WorkspaceView({
  activeProject,
  activeProfile,
  profiles,
  usageReading,
  activeSessions,
  onSelectProfile,
  onOpenCreateProject,
  onSelectProjectName,
  onSessionSpawned,
}: WorkspaceViewProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const handleLaunchSession = async (promptOrArgs?: string) => {
    if (!activeProject) return;
    setIsLaunching(true);
    setLaunchError(null);

    try {
      const session = await invoke<Session>("spawn_session", {
        input: {
          project_id: activeProject.id,
          project_path: activeProject.path,
          profile_id: activeProfile?.id,
          custom_command: promptOrArgs,
        },
      });

      onSessionSpawned?.(session);
    } catch (err) {
      setLaunchError(typeof err === "string" ? err : "Failed to spawn session");
    } finally {
      setIsLaunching(false);
    }
  };

  const projectSessions = activeSessions.filter(
    (s) => s.project_id === activeProject?.id
  );

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden">
      {/* Launch error notification banner if any */}
      {launchError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-xl border border-rose-500/40 bg-rose-950/80 px-4 py-2 text-xs text-rose-200 shadow-xl backdrop-blur-md">
          {launchError}
        </div>
      )}

      {/* Center Hero */}
      <ProjectHero
        project={activeProject}
        profile={activeProfile}
        usageReading={usageReading}
        activeSessionCount={projectSessions.length}
        onOpenCreateProject={onOpenCreateProject}
        onSelectProjectName={onSelectProjectName}
      />

      {/* Bottom Floating Command Capsule */}
      <DockedLauncher
        activeProject={activeProject}
        activeProfile={activeProfile}
        profiles={profiles}
        onSelectProfile={onSelectProfile}
        onLaunchSession={handleLaunchSession}
        isLaunching={isLaunching}
      />
    </div>
  );
}
