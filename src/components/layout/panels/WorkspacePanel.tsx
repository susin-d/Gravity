import { useState, useMemo } from "react";
import {
  Folder,
  Plus,
  Search,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { Project } from "../../../pages/Projects";
import { Profile } from "../../../pages/Profiles";

interface WorkspacePanelProps {
  projects: Project[];
  profiles: Profile[];
  activeProjectId: string | null;
  activeProfileId: string | null;
  onSelectProject: (id: string) => void;
  onSelectProfile: (id: string) => void;
  onNewSession: () => void;
  onOpenCreateProject?: () => void;
}

export default function WorkspacePanel({
  projects,
  profiles,
  activeProjectId,
  activeProfileId,
  onSelectProject,
  onSelectProfile,
  onNewSession,
  onOpenCreateProject,
}: WorkspacePanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const displayedProjects = showAllProjects
    ? filteredProjects
    : filteredProjects.slice(0, 5);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header: Profile Switcher & Actions ─────────────────────────────── */}
      <div className="relative flex items-center justify-between border-b border-edge-subtle px-3 py-2.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-white hover:bg-glass-2 transition-colors"
          >
            <span>{activeProfile ? activeProfile.label : "Select Profile"}</span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-low" />
          </button>

          {showProfileDropdown && (
            <div className="absolute left-0 top-full mt-1 w-52 rounded-xl border border-edge-DEFAULT bg-[#141414] p-1.5 shadow-2xl z-50">
              <div className="px-2 py-1 text-[10px] font-mono uppercase text-ink-low">
                Switch Profile
              </div>
              <div className="my-1 border-t border-edge-subtle" />
              {profiles.length === 0 ? (
                <div className="px-2 py-2 text-ink-low text-[11px]">
                  No profiles configured
                </div>
              ) : (
                profiles.map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => {
                      onSelectProfile(prof.id);
                      setShowProfileDropdown(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      prof.id === activeProfile?.id
                        ? "bg-white text-black font-medium"
                        : "text-ink-high hover:bg-glass-2 hover:text-white"
                    }`}
                  >
                    <span className="truncate">{prof.label}</span>
                    <span className="text-[10px] uppercase font-mono opacity-70">
                      {prof.vendor}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            title="Search projects"
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              showSearch ? "bg-glass-3 text-white" : "text-ink-low hover:bg-glass-2 hover:text-white"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Search Input ──────────────────────────────────────────────────── */}
      {showSearch && (
        <div className="border-b border-edge-subtle px-3 py-2 bg-glass-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-md border border-edge-subtle bg-black/40 px-2.5 py-1 text-xs text-white placeholder-ink-low focus:border-edge-DEFAULT focus:outline-none"
            autoFocus
          />
        </div>
      )}

      {/* ── New Chat / Session Action Button ──────────────────────────────── */}
      <div className="p-3">
        <button
          type="button"
          onClick={onNewSession}
          className="flex w-full items-center gap-2 rounded-xl border border-edge-subtle bg-glass-1 px-3 py-2 text-xs font-medium text-ink-high hover:border-edge-DEFAULT hover:bg-glass-2 hover:text-white transition-all shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>New Session</span>
        </button>
      </div>

      {/* ── Scrollable Lists ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {/* Projects Section */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-low">
            <span>Projects</span>
            {onOpenCreateProject && (
              <button
                type="button"
                onClick={onOpenCreateProject}
                className="hover:text-white transition-colors"
                title="Register Project"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-1 mt-1">
            {displayedProjects.length === 0 ? (
              <div className="px-2 py-3 text-center text-ink-low text-[11px]">
                {searchQuery ? "No matching projects" : "No registered projects"}
              </div>
            ) : (
              displayedProjects.map((proj) => {
                const isSelected = proj.id === activeProjectId;
                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => onSelectProject(proj.id)}
                    className={`group relative flex w-full flex-col rounded-xl px-3 py-2 text-left transition-all ${
                      isSelected
                        ? "bg-[#181818] border border-edge-DEFAULT shadow-md text-white"
                        : "text-ink-mid hover:bg-glass-2 hover:text-white border border-transparent"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-white" : "text-ink-low"}`} />
                        <span className="truncate text-xs font-medium">{proj.name}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-1 text-[10px] text-ink-low font-mono">
                        {proj.tag}
                      </div>
                    )}
                  </button>
                );
              })
            )}

            {filteredProjects.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllProjects(!showAllProjects)}
                className="w-full text-left px-2.5 py-1 text-[11px] text-ink-low hover:text-white transition-colors"
              >
                {showAllProjects ? "Show less" : `Show more (${filteredProjects.length - 5})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Strip ──────────────────────────────────────────────────── */}
      <div className="border-t border-edge-subtle px-3 py-2.5 flex items-center justify-between text-[11px] text-ink-low">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-ink-low" />
          <span>Gravity Engine</span>
        </div>
        <span className="font-mono text-[10px]">Win32</span>
      </div>
    </div>
  );
}
