import { useState, KeyboardEvent } from "react";
import {
  Folder,
  Laptop,
  GitBranch,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  Mic,
  ArrowUp,
  Loader2,
} from "lucide-react";
import { Project } from "../../pages/Projects";
import { Profile } from "../../pages/Profiles";

interface DockedLauncherProps {
  activeProject: Project | null;
  activeProfile: Profile | null;
  profiles: Profile[];
  onSelectProfile: (id: string) => void;
  onLaunchSession: (promptOrArgs?: string) => Promise<void>;
  isLaunching?: boolean;
}

export default function DockedLauncher({
  activeProject,
  activeProfile,
  profiles,
  onSelectProfile,
  onLaunchSession,
  isLaunching = false,
}: DockedLauncherProps) {
  const [inputVal, setInputVal] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);

  const handleSubmit = async () => {
    if (isLaunching) return;
    await onLaunchSession(inputVal.trim() || undefined);
    setInputVal("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isClient = activeProject?.tag === "client" || activeProfile?.tag === "client";

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-6 z-20">
      {/* ── Context Shelf Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-ink-low">
        <div className="flex items-center gap-1.5 hover:text-white transition-colors cursor-default">
          <Folder className="h-3.5 w-3.5" />
          <span className="font-medium text-ink-mid">
            {activeProject ? activeProject.name : "No Project Selected"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Laptop className="h-3.5 w-3.5" />
          <span>Local</span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <GitBranch className="h-3.5 w-3.5" />
          <span>main</span>
        </div>
      </div>

      {/* ── Input Capsule ─────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col rounded-2xl border border-edge-DEFAULT bg-[#141414] shadow-2xl transition-all duration-200 focus-within:border-white/30 focus-within:shadow-glow"
        style={{
          background: "rgba(20, 20, 20, 0.95)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Input Text Field */}
        <div className="px-4 pt-3.5 pb-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLaunching}
            placeholder="Do anything or enter CLI arguments..."
            className="w-full bg-transparent text-sm text-white placeholder-ink-low focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Bottom Toolbar inside Capsule */}
        <div className="flex items-center justify-between px-3 pb-3 pt-1">
          {/* Left tools: Add & Tag Mode Badge */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-low hover:bg-glass-2 hover:text-white transition-colors"
              title="Add CLI Flags or Presets"
            >
              <Plus className="h-4 w-4" />
            </button>

            {isClient ? (
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border border-rose-500/40 text-rose-300"
                style={{ background: "rgba(244, 63, 94, 0.12)" }}
                title="Client Boundary Active: Auto-switch strictly disabled"
              >
                <ShieldAlert className="h-3 w-3 text-rose-400" />
                <span>Client Protected</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border border-amber-500/30 text-amber-300"
                style={{ background: "rgba(245, 158, 11, 0.10)" }}
              >
                <ShieldCheck className="h-3 w-3 text-amber-400" />
                <span>{activeProject ? `${activeProject.tag} access` : "Standard access"}</span>
              </div>
            )}
          </div>

          {/* Right tools: Model/Profile picker, Voice mic, Action button */}
          <div className="flex items-center gap-2">
            {/* Model/Profile dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-ink-high hover:bg-glass-2 hover:text-white transition-colors"
              >
                <span className="font-medium">
                  {activeProfile ? `${activeProfile.label} (${activeProfile.vendor})` : "Select Model"}
                </span>
                <ChevronDown className="h-3 w-3 text-ink-low" />
              </button>

              {showModelPicker && (
                <div className="absolute right-0 bottom-full mb-2 w-56 rounded-xl border border-edge-DEFAULT bg-[#181818] p-1.5 shadow-2xl z-50">
                  <div className="px-2.5 py-1 text-[10px] font-mono uppercase text-ink-low">
                    Select CLI Profile
                  </div>
                  <div className="my-1 border-t border-edge-subtle" />
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelectProfile(p.id);
                        setShowModelPicker(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                        p.id === activeProfile?.id
                          ? "bg-white text-black font-medium"
                          : "text-ink-high hover:bg-glass-2 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{p.label}</span>
                      <span className="text-[10px] uppercase font-mono opacity-70">
                        {p.vendor}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Voice / Mic placeholder */}
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-low hover:bg-glass-2 hover:text-white transition-colors"
              title="Voice Prompt (Planned)"
            >
              <Mic className="h-3.5 w-3.5" />
            </button>

            {/* Submit Action Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLaunching || !activeProject}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                activeProject && !isLaunching
                  ? "bg-white text-black hover:scale-105 active:scale-95 shadow-glow"
                  : "bg-glass-3 text-ink-low cursor-not-allowed"
              }`}
              title={
                !activeProject
                  ? "Select a project to launch"
                  : isLaunching
                  ? "Launching session..."
                  : "Launch Terminal Session (Win32 Job Object)"
              }
            >
              {isLaunching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
