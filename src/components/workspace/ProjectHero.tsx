import { Terminal, Plus, ShieldAlert, Cpu } from "lucide-react";
import { Project } from "../../pages/Projects";
import { Profile } from "../../pages/Profiles";
import UsageBadge, { UsageReading } from "../UsageBadge";

interface ProjectHeroProps {
  project: Project | null;
  profile: Profile | null;
  usageReading?: UsageReading | null;
  activeSessionCount?: number;
  onOpenCreateProject?: () => void;
  onSelectProjectName?: () => void;
}

export default function ProjectHero({
  project,
  profile,
  usageReading,
  activeSessionCount = 0,
  onOpenCreateProject,
  onSelectProjectName,
}: ProjectHeroProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center select-none">
      {/* ── Center Prompt / Cloud Icon ───────────────────────────────────── */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-edge-DEFAULT bg-[#141414] shadow-2xl">
        <div className="absolute inset-0 rounded-3xl bg-white/[0.03] backdrop-blur-xl" />
        <Terminal className="h-9 w-9 text-ink-high relative z-10" />
      </div>

      {/* ── Main Headline ─────────────────────────────────────────────────── */}
      {project ? (
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-snug">
            What should we build in{" "}
            <button
              type="button"
              onClick={onSelectProjectName}
              className="underline decoration-dotted underline-offset-8 decoration-white/40 hover:decoration-white hover:text-white transition-all cursor-pointer"
              title="Click to view project settings"
            >
              {project.name}
            </button>
            ?
          </h1>

          {/* Sub-status bar / Telemetry */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {/* Usage Reading Badge */}
            <UsageBadge reading={usageReading} />

            {/* Client boundary warning or tag */}
            {project.tag === "client" ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-rose-500/40 text-rose-300"
                style={{ background: "rgba(244, 63, 94, 0.12)" }}
              >
                <ShieldAlert className="h-3 w-3 text-rose-400" />
                <span>Client Protected</span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-edge-subtle bg-glass-2 px-2.5 py-1 text-xs text-ink-mid">
                Tag: {project.tag}
              </span>
            )}

            {/* Profile badge */}
            {profile && (
              <span className="inline-flex items-center rounded-full border border-edge-subtle bg-glass-2 px-2.5 py-1 text-xs text-ink-mid">
                Profile: {profile.label} ({profile.vendor})
              </span>
            )}

            {/* Win32 Job Object Session indicator */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-edge-subtle bg-glass-2 px-2.5 py-1 text-xs text-ink-mid">
              <Cpu className="h-3 w-3 text-ink-low" />
              <span>{activeSessionCount} active job{activeSessionCount === 1 ? "" : "s"}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Select a project to start
          </h1>
          <p className="mt-2 text-sm text-ink-mid">
            Choose a registered project from the sidebar, or register a new workspace directory.
          </p>
          {onOpenCreateProject && (
            <div className="mt-5">
              <button
                type="button"
                onClick={onOpenCreateProject}
                className="inline-flex items-center gap-2 rounded-xl border border-edge-DEFAULT bg-white px-4 py-2 text-xs font-medium text-black hover:bg-neutral-200 transition-colors shadow-glow"
              >
                <Plus className="h-4 w-4" />
                <span>Register New Project</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
