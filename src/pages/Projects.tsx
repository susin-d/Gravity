import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
  Folder,
  Plus,
  Trash2,
  X,
  Play,
} from "lucide-react";
import { Profile } from "./Profiles";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";

export interface Project {
  id: string;
  path: string;
  name: string;
  tag: "personal" | "work" | "client";
  auto_switch_enabled: number;
  default_profile_id?: string;
  terminal: string;
  created_at: string;
  updated_at: string;
}

interface AppSettings {
  flags: { auto_switch: boolean };
}

interface ProjectsProps {
  selectedProjectId?: string | null;
  onSelectProject?: (id: string) => void;
}

export default function Projects({
  selectedProjectId,
  onSelectProject,
}: ProjectsProps = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [flags, setFlags] = useState<{ auto_switch: boolean }>({ auto_switch: false });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [path, setPath] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [tag, setTag] = useState<"personal" | "work" | "client">("personal");
  const [defaultProfileId, setDefaultProfileId] = useState<string>("");
  const [terminal, setTerminal] = useState<string>("auto");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [projList, profList, settings] = await Promise.all([
        invoke<Project[]>("list_projects"),
        invoke<Profile[]>("list_profiles"),
        invoke<AppSettings>("get_settings"),
      ]);
      setProjects(projList);
      setProfiles(profList);
      setFlags(settings.flags);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    try {
      setSubmitting(true);
      await invoke("create_project", {
        input: {
          path: path.trim(),
          name: name.trim() ? name.trim() : null,
          tag,
          default_profile_id: defaultProfileId ? defaultProfileId : null,
          terminal,
        },
      });
      setPath("");
      setName("");
      setTag("personal");
      setDefaultProfileId("");
      setTerminal("auto");
      setShowModal(false);
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAutoSwitch = async (project: Project) => {
    if (project.tag === "client") {
      setError("Client projects cannot have auto-switch enabled.");
      return;
    }
    if (!flags.auto_switch) {
      setError("Auto-switch feature is disabled in flags.toml.");
      return;
    }
    try {
      const newState = project.auto_switch_enabled === 0;
      await invoke("set_project_auto_switch", {
        projectId: project.id,
        enabled: newState,
      });
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDeleteProject = async (id: string, projectName: string) => {
    if (
      !confirm(
        `Unregister project "${projectName}"? Local directory files will not be deleted.`
      )
    )
      return;
    try {
      await invoke("delete_project", { id });
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleLaunchProject = async (project: Project) => {
    try {
      setLaunchingId(project.id);
      await invoke("spawn_session", {
        input: {
          profile_id: project.default_profile_id ?? null,
          project_path: project.path,
          project_id: project.id,
          custom_command: null,
        },
      });
    } catch (err) {
      setError(`Failed to spawn terminal: ${String(err)}`);
    } finally {
      setLaunchingId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <p className="text-xs text-ink-low mt-0.5">
            Directory registry with isolation tags and terminal preferences.
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Register Project</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between bg-red-950/30 border border-red-800/60 text-red-300 text-xs rounded-xl p-3">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setError(null)}
            className="h-6 w-6 text-red-400 hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Projects List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4 flex items-center justify-between">
              <div className="space-y-2">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-3 w-64 rounded" />
              </div>
              <div className="skeleton h-8 w-20 rounded" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <p className="text-ink-mid text-sm font-medium">No projects registered</p>
          <p className="text-ink-low text-xs mt-1">
            Register a repository directory to assign default profiles and boundaries.
          </p>
          <Button
            onClick={() => setShowModal(true)}
            variant="secondary"
            size="sm"
            className="mt-4"
          >
            Register your first project
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((proj) => {
            const isClient = proj.tag === "client";
            const autoSwitchDisabled = isClient || !flags.auto_switch;
            const autoSwitchTooltip = isClient
              ? "Client projects are strictly protected from automated switching."
              : !flags.auto_switch
              ? "Auto-switch is disabled in flags.toml."
              : "Toggle automated profile switching on rate limit.";
            const defaultProfile = profiles.find(
              (p) => p.id === proj.default_profile_id
            );

            const isSelected = selectedProjectId === proj.id;

            return (
              <motion.div
                key={proj.id}
                onClick={() => onSelectProject?.(proj.id)}
                whileHover={{ y: -1 }}
                transition={{ duration: 0.1 }}
                className={`card p-4 flex items-center justify-between gap-4 cursor-pointer transition-all ${
                  isSelected ? "border-white/40 shadow-glow bg-[#181818]" : ""
                }`}
              >
                {/* Info */}
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">
                      {proj.name}
                    </span>
                    <Badge variant={proj.tag}>{proj.tag}</Badge>
                    {proj.terminal !== "auto" && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {proj.terminal}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-low">
                    <Folder className="h-3 w-3 text-ink-low flex-shrink-0" />
                    <span className="font-mono truncate" title={proj.path}>
                      {proj.path}
                    </span>
                  </div>
                  <p className="text-xs text-ink-low">
                    Default profile:{" "}
                    {defaultProfile ? (
                      <span className="text-ink-mid font-medium">
                        {defaultProfile.label} ({defaultProfile.vendor})
                      </span>
                    ) : (
                      <span className="italic text-ink-low">
                        None assigned (uses first available)
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-4 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Auto-switch toggle using Radix Switch */}
                  {flags.auto_switch && (
                    <div
                      className="flex flex-col items-end gap-1"
                      title={autoSwitchTooltip}
                    >
                      <label className="text-[10px] text-ink-low">
                        Auto-switch
                      </label>
                      <Switch
                        checked={proj.auto_switch_enabled === 1 && !autoSwitchDisabled}
                        disabled={autoSwitchDisabled}
                        onCheckedChange={() => handleToggleAutoSwitch(proj)}
                      />
                    </div>
                  )}

                  <Button
                    onClick={() => handleLaunchProject(proj)}
                    disabled={launchingId === proj.id}
                    size="sm"
                    className="flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{launchingId === proj.id ? "Launching…" : "Launch"}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteProject(proj.id, proj.name)}
                    className="h-8 w-8 text-ink-low hover:text-red-400"
                    title="Unregister project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Radix Dialog: Register Project Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Project Folder</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label className="form-label">Folder Path *</label>
              <input
                type="text"
                required
                placeholder="e.g. C:\project\MyRepo"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  if (!name.trim()) {
                    const segments = e.target.value
                      .replace(/\\/g, "/")
                      .split("/");
                    const inferred =
                      segments[segments.length - 1] ||
                      segments[segments.length - 2];
                    if (inferred) setName(inferred);
                  }
                }}
                className="input input-mono"
              />
            </div>

            <div>
              <label className="form-label">Project Name (Optional)</label>
              <input
                type="text"
                placeholder="Auto-inferred from folder name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Isolation Tag</label>
                <select
                  value={tag}
                  onChange={(e) =>
                    setTag(e.target.value as "personal" | "work" | "client")
                  }
                  className="input"
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="client">Client (Strict)</option>
                </select>
              </div>

              <div>
                <label className="form-label">Terminal</label>
                <select
                  value={terminal}
                  onChange={(e) => setTerminal(e.target.value)}
                  className="input"
                >
                  <option value="auto">Auto (WT / PS)</option>
                  <option value="wt">Windows Terminal</option>
                  <option value="powershell">PowerShell</option>
                  <option value="wsl" disabled>
                    WSL (planned)
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">Default Profile</label>
              <select
                value={defaultProfileId}
                onChange={(e) => setDefaultProfileId(e.target.value)}
                className="input"
              >
                <option value="">None (Use first available)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.vendor} · {p.tag})
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-3 border-t border-edge-subtle">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !path.trim()}
              >
                {submitting ? "Registering…" : "Register Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
