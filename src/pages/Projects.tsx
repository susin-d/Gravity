import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Profile } from "./Profiles";

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
  flags: {
    auto_switch: boolean;
  };
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [flags, setFlags] = useState<{ auto_switch: boolean }>({ auto_switch: false });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New project modal state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [path, setPath] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [tag, setTag] = useState<"personal" | "work" | "client">("personal");
  const [defaultProfileId, setDefaultProfileId] = useState<string>("");
  const [terminal, setTerminal] = useState<string>("auto");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Launching state
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

      // Reset
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
    if (!confirm(`Unregister project "${projectName}"? Local directory files will not be deleted.`)) return;
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
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Projects</h2>
          <p className="text-xs text-gray-500 mt-1">
            Directory registry with isolation tags and terminal preferences.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-gravity-600 hover:bg-gravity-500 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          + Register Project
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-xs rounded-lg p-3 mb-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse">Loading projects…</p>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No projects registered yet.</p>
          <p className="text-gray-600 text-xs mt-1">
            Register a repository directory to assign default profiles and boundaries.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-md"
          >
            Register your first project
          </button>
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

            const defaultProfile = profiles.find((p) => p.id === proj.default_profile_id);

            const tagColors = {
              personal: "bg-blue-900/50 text-blue-300 border-blue-800",
              work: "bg-purple-900/50 text-purple-300 border-purple-800",
              client: "bg-amber-900/50 text-amber-300 border-amber-800",
            }[proj.tag];

            return (
              <div
                key={proj.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between hover:border-gray-700 transition-colors"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-200">{proj.name}</span>
                    <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${tagColors}`}>
                      {proj.tag}
                    </span>
                    {proj.terminal !== "auto" && (
                      <span className="text-[10px] font-mono text-gray-500 bg-gray-950 px-1.5 py-0.5 rounded border border-gray-800">
                        {proj.terminal}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono truncate" title={proj.path}>
                    📂 {proj.path}
                  </div>
                  <div className="text-xs text-gray-400">
                    Default profile:{" "}
                    {defaultProfile ? (
                      <span className="text-gray-300 font-medium">
                        {defaultProfile.label} ({defaultProfile.vendor})
                      </span>
                    ) : (
                      <span className="text-gray-600 italic">None assigned (uses first available)</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Auto-Switch Policy Toggle */}
                  <div className="text-right" title={autoSwitchTooltip}>
                    <label className="text-[11px] text-gray-400 block mb-1">
                      Auto-switch
                    </label>
                    <button
                      type="button"
                      disabled={autoSwitchDisabled}
                      onClick={() => handleToggleAutoSwitch(proj)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        proj.auto_switch_enabled && !autoSwitchDisabled
                          ? "bg-gravity-600"
                          : "bg-gray-800"
                      } ${autoSwitchDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          proj.auto_switch_enabled && !autoSwitchDisabled
                            ? "translate-x-4"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Launch button */}
                  <button
                    onClick={() => handleLaunchProject(proj)}
                    disabled={launchingId === proj.id}
                    className="px-3 py-2 bg-gravity-600 hover:bg-gravity-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {launchingId === proj.id ? "Launching…" : "🚀 Launch"}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteProject(proj.id, proj.name)}
                    className="text-gray-600 hover:text-red-400 text-xs p-1"
                    title="Unregister project"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Register Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Register Project Folder</h3>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Folder Path *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. C:\project\MyRepo"
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value);
                    if (!name.trim()) {
                      const segments = e.target.value.replace(/\\/g, "/").split("/");
                      const inferred = segments[segments.length - 1] || segments[segments.length - 2];
                      if (inferred) setName(inferred);
                    }
                  }}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Project Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Auto-inferred from folder name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Isolation Tag
                  </label>
                  <select
                    value={tag}
                    onChange={(e) => setTag(e.target.value as "personal" | "work" | "client")}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500"
                  >
                    <option value="personal">Personal</option>
                    <option value="work">Work</option>
                    <option value="client">Client (Strict)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Terminal
                  </label>
                  <select
                    value={terminal}
                    onChange={(e) => setTerminal(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500"
                  >
                    <option value="auto">Auto (WT / PS)</option>
                    <option value="wt">Windows Terminal</option>
                    <option value="powershell">PowerShell</option>
                    <option value="wsl" disabled>WSL (planned)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Default Profile
                </label>
                <select
                  value={defaultProfileId}
                  onChange={(e) => setDefaultProfileId(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500"
                >
                  <option value="">None (Use first available)</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.vendor} · {p.tag})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !path.trim()}
                  className="px-4 py-2 bg-gravity-600 hover:bg-gravity-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {submitting ? "Registering…" : "Register Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
