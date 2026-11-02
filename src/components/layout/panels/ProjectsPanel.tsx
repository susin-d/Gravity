import { useState, useMemo } from "react";
import { Folder, Plus, Search, ShieldAlert } from "lucide-react";
import { Project } from "../../../pages/Projects";

interface ProjectsPanelProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onOpenCreateProject?: () => void;
}

export default function ProjectsPanel({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenCreateProject,
}: ProjectsPanelProps) {
  const [filterTag, setFilterTag] = useState<"all" | "personal" | "work" | "client">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchTag = filterTag === "all" || p.tag === filterTag;
      const matchQuery =
        !query.trim() ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.path.toLowerCase().includes(query.toLowerCase());
      return matchTag && matchQuery;
    });
  }, [projects, filterTag, query]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-subtle px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-white" />
          <span className="text-xs font-semibold text-white">Project Registry</span>
        </div>
        {onOpenCreateProject && (
          <button
            type="button"
            onClick={onOpenCreateProject}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-edge-subtle bg-glass-2 text-ink-high hover:border-edge-DEFAULT hover:text-white transition-colors"
            title="Register Project"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Search & Tag Filter Pills */}
      <div className="border-b border-edge-subtle p-2 space-y-2 bg-glass-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-ink-low" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter projects..."
            className="w-full rounded-md border border-edge-subtle bg-black/40 pl-8 pr-2.5 py-1 text-xs text-white placeholder-ink-low focus:border-edge-DEFAULT focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          {(["all", "personal", "work", "client"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterTag(t)}
              className={`rounded-md px-2 py-0.5 capitalize transition-colors ${
                filterTag === t
                  ? "bg-white text-black font-medium"
                  : "text-ink-low hover:bg-glass-2 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-ink-low">
            No matching projects
          </div>
        ) : (
          filtered.map((proj) => {
            const isSelected = proj.id === selectedProjectId;
            return (
              <button
                key={proj.id}
                type="button"
                onClick={() => onSelectProject(proj.id)}
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-all ${
                  isSelected
                    ? "bg-[#181818] border border-edge-DEFAULT text-white shadow-md"
                    : "text-ink-mid hover:bg-glass-2 hover:text-white border border-transparent"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="truncate text-xs font-medium">{proj.name}</span>
                  {proj.tag === "client" ? (
                    <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono border border-rose-500/30 text-rose-300 bg-rose-950/20">
                      <ShieldAlert className="h-2.5 w-2.5" />
                      client
                    </span>
                  ) : (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-mono border border-edge-subtle text-ink-low">
                      {proj.tag}
                    </span>
                  )}
                </div>
                <span className="mt-1 truncate font-mono text-[10px] text-ink-low">
                  {proj.path}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-edge-subtle px-3 py-2 text-[10px] text-ink-low font-mono flex justify-between">
        <span>{filtered.length} projects</span>
        <span>SQLite</span>
      </div>
    </div>
  );
}
