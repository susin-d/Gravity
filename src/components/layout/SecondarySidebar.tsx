import { useState, useMemo } from "react";
import {
  Folder,
  Plus,
  Search,
  Bell,
  ChevronDown,
  Pin,
  Sparkles,
} from "lucide-react";
import { Project } from "../../pages/Projects";
import { Profile } from "../../pages/Profiles";

interface SecondarySidebarProps {
  isOpen: boolean;
  projects: Project[];
  profiles: Profile[];
  activeProjectId: string | null;
  activeProfileId: string | null;
  onSelectProject: (id: string) => void;
  onSelectProfile: (id: string) => void;
  onNewSession: () => void;
  onOpenCreateProject?: () => void;
}

export default function SecondarySidebar({
  isOpen,
  projects,
  profiles,
  activeProjectId,
  activeProfileId,
  onSelectProject,
  onSelectProfile,
  onNewSession,
  onOpenCreateProject,
}: SecondarySidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    return projects.length > 0 ? [projects[0].id] : [];
  });
  const [showAllProjects, setShowAllProjects] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const pinnedProjects = useMemo(() => {
    return projects.filter((p) => pinnedIds.includes(p.id));
  }, [projects, pinnedIds]);

  const displayedProjects = showAllProjects
    ? filteredProjects
    : filteredProjects.slice(0, 5);

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPinnedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  if (!isOpen) return null;

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r border-edge-subtle bg-[#0e0e0e] text-xs text-ink-mid z-20 select-none transition-all duration-200"
      style={{
        background: "rgba(14, 14, 14, 0.96)",
      }}
    >
      {/* ── Header: Provider/Profile Switcher, Bell, Search ────────────────── */}
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
            title="Notifications"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-low hover:bg-glass-2 hover:text-white transition-colors"
          >
            <Bell className="h-3.5 w-3.5" />
          </button>
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

      {/* ── Search Input (Toggled) ─────────────────────────────────────────── */}
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

      {/* ── Project Lists / Scrollable Body ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {/* Pinned Section */}
        {pinnedProjects.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-low">
              <span>Pinned</span>
            </div>
            <div className="space-y-0.5 mt-1">
              {pinnedProjects.map((proj) => {
                const isSelected = proj.id === activeProjectId;
                return (
                  <button
                    key={`pin-${proj.id}`}
                    type="button"
                    onClick={() => onSelectProject(proj.id)}
                    className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                      isSelected
                        ? "bg-glass-3 text-white font-medium border border-edge-subtle"
                        : "text-ink-mid hover:bg-glass-2 hover:text-white"
                    }`}
                  >
                    <span className="truncate text-xs">{proj.name}</span>
                    <Pin className="h-3 w-3 text-white/40 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                      <button
                        type="button"
                        onClick={(e) => togglePin(e, proj.id)}
                        className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity p-0.5"
                        title={pinnedIds.includes(proj.id) ? "Unpin" : "Pin"}
                      >
                        <Pin className="h-3 w-3 text-ink-low hover:text-white" />
                      </button>
                    </div>

                    {isSelected && (
                      <div className="mt-1 flex items-center justify-between text-[10px] text-ink-low font-mono">
                        <span className="truncate">{proj.tag}</span>
                        <span>ready</span>
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

        {/* Recents Section */}
        <div>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-low">
            <span>Recents</span>
          </div>
          <div className="px-2 py-1.5 text-[11px] text-ink-low italic">
            No recent switch events
          </div>
        </div>
      </div>

      {/* ── Bottom Sidebar Strip ──────────────────────────────────────────── */}
      <div className="border-t border-edge-subtle px-3 py-2.5 flex items-center justify-between text-[11px] text-ink-low">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-ink-low" />
          <span>Gravity Engine</span>
        </div>
        <span className="font-mono text-[10px]">Win32</span>
      </div>
    </aside>
  );
}
