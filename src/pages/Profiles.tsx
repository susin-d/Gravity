import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import UsageBadge, { UsageReading } from "../components/UsageBadge";
import LimitToast from "../components/LimitToast";
import ClientBoundaryModal from "../components/ClientBoundaryModal";

export interface Profile {
  id: string;
  label: string;
  vendor: "claude" | "codex";
  tag: "personal" | "work" | "client";
  config_dir: string;
  cred_ref: string;
  created_at: string;
  updated_at: string;
  is_active: number;
}

export interface Session {
  id: string;
  profile_id: string;
  project_id?: string;
  pid?: number;
  started_at: string;
  status: string;
}

interface SwitchExecutionResult {
  switch_event: {
    id: string;
    outcome: string;
  };
  new_session?: Session;
  requires_client_confirmation: boolean;
  confirmation_message?: string;
}

export default function Profiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [usages, setUsages] = useState<Record<string, UsageReading>>({});
  const [wtAvailable, setWtAvailable] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New profile modal form state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [label, setLabel] = useState<string>("");
  const [vendor, setVendor] = useState<"claude" | "codex">("claude");
  const [tag, setTag] = useState<"personal" | "work" | "client">("personal");
  const [secret, setSecret] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Session launching state
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [refreshingUsageId, setRefreshingUsageId] = useState<string | null>(null);

  // M5: Rate limit toast & client modal simulation states
  const [activeToast, setActiveToast] = useState<{
    fromProfile: Profile;
    suggestedProfile: Profile | null;
    rawSignal?: string;
  } | null>(null);

  const [clientBoundaryPrompt, setClientBoundaryPrompt] = useState<{
    fromProfile: Profile;
    targetProfile: Profile;
  } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profs, sess, wt, latestUsages] = await Promise.all([
        invoke<Profile[]>("list_profiles"),
        invoke<Session[]>("list_sessions"),
        invoke<boolean>("check_terminal_available"),
        invoke<Record<string, UsageReading>>("list_latest_usages"),
      ]);
      setProfiles(profs);
      setSessions(sess);
      setWtAvailable(wt);
      setUsages(latestUsages);
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

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    try {
      setSubmitting(true);
      await invoke("create_profile", {
        input: {
          label: label.trim(),
          vendor,
          tag,
          secret: secret.trim() ? secret.trim() : null,
        },
      });

      setLabel("");
      setSecret("");
      setTag("personal");
      setVendor("claude");
      setShowModal(false);
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) return;
    try {
      await invoke("delete_profile", { id });
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleLaunchSession = async (profileId: string) => {
    try {
      setLaunchingId(profileId);
      await invoke("spawn_session", {
        input: {
          profile_id: profileId,
          project_path: null,
          project_id: null,
          custom_command: null,
        },
      });
      await loadData();
    } catch (err) {
      setError(`Failed to spawn terminal session: ${String(err)}`);
    } finally {
      setLaunchingId(null);
    }
  };

  // M5: Trigger rate limit simulation and fetch MRU suggestion
  const handleSimulateLimit = async (fromProfile: Profile) => {
    try {
      const suggestion = await invoke<Profile | null>("suggest_fallback_profile", {
        fromProfileId: fromProfile.id,
      });

      setActiveToast({
        fromProfile,
        suggestedProfile: suggestion,
        rawSignal: `Rate limit reached on ${fromProfile.label}. 429 Too Many Requests. Quota exhausted.`,
      });
    } catch (err) {
      setError(String(err));
    }
  };

  // M5: Handle clicking Continue from Limit Toast
  const handleContinueSwitch = async (targetProfile: Profile) => {
    if (!activeToast) return;
    const fromProfile = activeToast.fromProfile;

    // Check client boundary
    if (fromProfile.tag === "client" || targetProfile.tag === "client") {
      setClientBoundaryPrompt({ fromProfile, targetProfile });
      setActiveToast(null);
      return;
    }

    try {
      await invoke<SwitchExecutionResult>("execute_profile_switch", {
        sessionId: null,
        fromProfileId: fromProfile.id,
        toProfileId: targetProfile.id,
        projectId: null,
        reason: "limit",
        clientConfirmed: false,
      });
      setActiveToast(null);
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  // M5: Confirm client boundary modal
  const handleConfirmClientModal = async () => {
    if (!clientBoundaryPrompt) return;
    const { fromProfile, targetProfile } = clientBoundaryPrompt;

    try {
      await invoke<SwitchExecutionResult>("execute_profile_switch", {
        sessionId: null,
        fromProfileId: fromProfile.id,
        toProfileId: targetProfile.id,
        projectId: null,
        reason: "limit",
        clientConfirmed: true,
      });
      setClientBoundaryPrompt(null);
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  // M5: Cancel client boundary modal (AC-07)
  const handleCancelClientModal = async () => {
    if (!clientBoundaryPrompt) return;
    const { fromProfile, targetProfile } = clientBoundaryPrompt;

    try {
      await invoke("record_switch_cancellation", {
        sessionId: null,
        fromProfileId: fromProfile.id,
        toProfileId: targetProfile.id,
        projectId: null,
        reason: "limit",
        detail: "User clicked Cancel on client boundary modal",
      });
      setClientBoundaryPrompt(null);
    } catch (err) {
      setError(String(err));
    }
  };

  // Quick simulation helper to test tri-state readings (AC-08 & AC-09)
  const handleSimulateUsage = async (profileId: string, state: "official" | "estimated" | "unknown") => {
    try {
      setRefreshingUsageId(profileId);
      let payload;
      if (state === "official") {
        const resetTime = new Date(Date.now() + 2.5 * 3600 * 1000).toISOString();
        payload = {
          profile_id: profileId,
          source: "official",
          window: "daily",
          value_used: 18240,
          value_limit: 50000,
          unit: "tokens",
          reset_at: resetTime,
          detail: "Official API quota reading",
        };
      } else if (state === "estimated") {
        payload = {
          profile_id: profileId,
          source: "estimated",
          window: "5min",
          value_used: 42,
          value_limit: 100,
          unit: "reqs",
          reset_at: null,
          detail: "Estimated from terminal response rate",
        };
      } else {
        payload = {
          profile_id: profileId,
          source: "unknown",
          window: null,
          value_used: null,
          value_limit: null,
          unit: null,
          reset_at: null,
          detail: "CLI version does not support automated telemetry.",
        };
      }

      await invoke("record_usage", { input: payload });
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshingUsageId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Profiles</h2>
          <p className="text-xs text-gray-500 mt-1">
            Isolated environments with separate config directories and Windows Job Object boundaries.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-gravity-600 hover:bg-gravity-500 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          + Add Profile
        </button>
      </div>

      {!wtAvailable && (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-xs rounded-lg p-3 mb-4">
          ⚠️ Windows Terminal (<code>wt.exe</code>) was not detected. Sessions will fall back to standalone PowerShell.
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-xs rounded-lg p-3 mb-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* Profiles Grid */}
      {loading ? (
        <p className="text-sm text-gray-500 animate-pulse">Loading profiles…</p>
      ) : profiles.length === 0 ? (
        <div className="border border-dashed border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">No profiles created yet.</p>
          <p className="text-gray-600 text-xs mt-1">
            Create an isolated Claude Code or Codex profile to get started.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-md"
          >
            Create your first profile
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((p) => {
            const isClaude = p.vendor === "claude";
            const tagColors = {
              personal: "bg-blue-900/50 text-blue-300 border-blue-800",
              work: "bg-purple-900/50 text-purple-300 border-purple-800",
              client: "bg-amber-900/50 text-amber-300 border-amber-800",
            }[p.tag];

            const usage = usages[p.id];

            return (
              <div
                key={p.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col justify-between hover:border-gray-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-200">{p.label}</span>
                        <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${tagColors}`}>
                          {p.tag}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 capitalize">
                        {isClaude ? "Claude Code" : "OpenAI Codex"}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteProfile(p.id, p.label)}
                      className="text-gray-600 hover:text-red-400 text-xs p-1"
                      title="Delete profile"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-3 text-xs space-y-1">
                    <div className="text-gray-500 font-mono truncate" title={p.config_dir}>
                      📂 <span className="text-gray-400">{p.config_dir}</span>
                    </div>
                  </div>

                  {/* Real-time Usage Telemetry Badge (M3) */}
                  <div className="mt-4">
                    <UsageBadge
                      reading={usage}
                      onRefresh={() => handleSimulateUsage(p.id, "official")}
                      refreshing={refreshingUsageId === p.id}
                    />

                    {/* Quick state switcher for verification of AC-08 & AC-09 */}
                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-600">
                      <button
                        onClick={() => handleSimulateLimit(p)}
                        className="text-amber-500 hover:text-amber-300 font-medium"
                        title="Simulate rate limit hit to test M5 Limit Toast"
                      >
                        ⚡ Simulate Limit Hit
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSimulateUsage(p.id, "official")}
                          className="hover:text-emerald-400 hover:underline"
                        >
                          [Official]
                        </button>
                        <button
                          onClick={() => handleSimulateUsage(p.id, "estimated")}
                          className="hover:text-amber-400 hover:underline"
                        >
                          [Est]
                        </button>
                        <button
                          onClick={() => handleSimulateUsage(p.id, "unknown")}
                          className="hover:text-gray-300 hover:underline"
                        >
                          [Unknown]
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center">
                  <span className="text-[11px] text-gray-600">
                    ID: {p.id.slice(0, 8)}…
                  </span>
                  <button
                    onClick={() => handleLaunchSession(p.id)}
                    disabled={launchingId === p.id}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gravity-600 text-gray-200 hover:text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {launchingId === p.id ? "Launching…" : "🚀 Launch Terminal"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Sessions Mini-Table */}
      {sessions.length > 0 && (
        <div className="mt-10">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Recent Sessions (Job Objects)
          </h3>
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-800/50 text-gray-400 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Session ID</th>
                  <th className="p-3">PID</th>
                  <th className="p-3">Started</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 font-mono">
                {sessions.slice(0, 5).map((s) => (
                  <tr key={s.id} className="hover:bg-gray-800/30">
                    <td className="p-3 text-gray-400">{s.id.slice(0, 12)}…</td>
                    <td className="p-3 text-gray-300">{s.pid ?? "—"}</td>
                    <td className="p-3 text-gray-500">{new Date(s.started_at).toLocaleTimeString()}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-green-900/50 text-green-400">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* M5: Limit Toast Notification */}
      {activeToast && (
        <LimitToast
          fromProfile={activeToast.fromProfile}
          suggestedProfile={activeToast.suggestedProfile}
          rawSignal={activeToast.rawSignal}
          onContinue={handleContinueSwitch}
          onStay={() => setActiveToast(null)}
          onManualSelect={() => setActiveToast(null)}
        />
      )}

      {/* M5: Client Boundary Confirmation Modal (AC-07) */}
      {clientBoundaryPrompt && (
        <ClientBoundaryModal
          targetProfile={clientBoundaryPrompt.targetProfile}
          fromProfile={clientBoundaryPrompt.fromProfile}
          onConfirm={handleConfirmClientModal}
          onCancel={handleCancelClientModal}
        />
      )}

      {/* Create Profile Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Create Isolated Profile</h3>

            <form onSubmit={handleCreateProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Profile Label *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Work, Personal, Acme Corp"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Vendor
                  </label>
                  <select
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value as "claude" | "codex")}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500"
                  >
                    <option value="claude">Claude Code</option>
                    <option value="codex">OpenAI Codex</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Tag / Boundary
                  </label>
                  <select
                    value={tag}
                    onChange={(e) => setTag(e.target.value as "personal" | "work" | "client")}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500"
                  >
                    <option value="personal">Personal</option>
                    <option value="work">Work</option>
                    <option value="client">Client (Guarded)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  API Key / Token (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Stored in Windows Credential Manager"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gravity-500 font-mono"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Leave blank if you prefer logging in via CLI browser OAuth.
                </p>
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
                  disabled={submitting || !label.trim()}
                  className="px-4 py-2 bg-gravity-600 hover:bg-gravity-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {submitting ? "Creating…" : "Create Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
