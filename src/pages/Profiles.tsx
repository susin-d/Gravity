import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
  Folder,
  Terminal,
  AlertTriangle,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import UsageBadge, { UsageReading } from "../components/UsageBadge";
import LimitToast from "../components/LimitToast";
import ClientBoundaryModal from "../components/ClientBoundaryModal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";

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
  switch_event: { id: string; outcome: string };
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

  // M5 states
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



  const handleContinueSwitch = async (targetProfile: Profile) => {
    if (!activeToast) return;
    const fromProfile = activeToast.fromProfile;
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

  const handleRefreshUsage = async (profileId: string) => {
    try {
      setRefreshingUsageId(profileId);
      const res = await invoke<UsageReading | null>("get_profile_usage", { profileId });
      if (res) {
        setUsages((prev) => ({ ...prev, [profileId]: res }));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshingUsageId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Profiles</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            Isolated environments with separate config directories and Job Object boundaries.
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Profile</span>
        </Button>
      </div>

      {/* WT warning */}
      {!wtAvailable && (
        <div className="flex items-center gap-2.5 bg-surface-1 border border-amber-800/40 text-amber-300 text-xs rounded-xl p-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span>
            <code className="font-mono text-text-primary">wt.exe</code> was not detected — sessions will fall back to standalone PowerShell.
          </span>
        </div>
      )}

      {/* Error banner */}
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

      {/* Profile grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-12 w-full rounded" />
            </div>
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div className="empty-state">
          <p className="text-text-secondary text-sm font-medium">No profiles created yet</p>
          <p className="text-text-tertiary text-xs mt-1">
            Create an isolated Claude Code or Codex profile to get started.
          </p>
          <Button
            onClick={() => setShowModal(true)}
            variant="secondary"
            size="sm"
            className="mt-4"
          >
            Create your first profile
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((p) => {
            const usage = usages[p.id];
            return (
              <motion.div
                key={p.id}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
                className="card p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  {/* Card top */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-text-primary text-sm">{p.label}</span>
                        <Badge variant={p.tag}>{p.tag}</Badge>
                        <Badge variant={p.vendor}>
                          {p.vendor === "claude" ? "Claude" : "Codex"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                        <Folder className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                        <span className="font-mono truncate max-w-[210px]" title={p.config_dir}>
                          {p.config_dir}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteProfile(p.id, p.label)}
                      className="h-7 w-7 text-text-tertiary hover:text-red-400"
                      title="Delete profile"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Usage telemetry */}
                  <div className="mt-4">
                    <UsageBadge
                      reading={usage}
                      onRefresh={() => handleRefreshUsage(p.id)}
                      refreshing={refreshingUsageId === p.id}
                    />
                  </div>
                </div>

                {/* Card footer */}
                <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                  <span className="text-[11px] text-text-tertiary font-mono">
                    ID: {p.id.slice(0, 8)}…
                  </span>
                  <Button
                    onClick={() => handleLaunchSession(p.id)}
                    disabled={launchingId === p.id}
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-1.5"
                  >
                    <Terminal className="h-3.5 w-3.5 text-text-secondary" />
                    <span>{launchingId === p.id ? "Launching…" : "Launch Terminal"}</span>
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Sessions table */}
      {sessions.length > 0 && (
        <div className="mt-8">
          <h3 className="section-heading mb-3">Recent Sessions (Job Objects)</h3>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-1 text-text-tertiary uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Session ID</th>
                  <th className="p-3">PID</th>
                  <th className="p-3">Started</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-mono">
                {sessions.slice(0, 5).map((s) => (
                  <tr key={s.id} className="hover:bg-surface-3 transition-colors">
                    <td className="p-3 text-text-tertiary">{s.id.slice(0, 12)}…</td>
                    <td className="p-3 text-text-secondary">{s.pid ?? "—"}</td>
                    <td className="p-3 text-text-tertiary">
                      {new Date(s.started_at).toLocaleTimeString()}
                    </td>
                    <td className="p-3">
                      <Badge variant="success">{s.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* M5 Overlays */}
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

      {clientBoundaryPrompt && (
        <ClientBoundaryModal
          targetProfile={clientBoundaryPrompt.targetProfile}
          fromProfile={clientBoundaryPrompt.fromProfile}
          onConfirm={handleConfirmClientModal}
          onCancel={handleCancelClientModal}
        />
      )}

      {/* Radix Dialog: Create Profile Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Isolated Profile</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateProfile} className="space-y-4">
            <div>
              <label className="form-label">Profile Label *</label>
              <input
                type="text"
                required
                placeholder="e.g. Work, Personal, Acme Corp"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Vendor</label>
                <select
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value as "claude" | "codex")}
                  className="input"
                >
                  <option value="claude">Claude Code</option>
                  <option value="codex">OpenAI Codex</option>
                </select>
              </div>

              <div>
                <label className="form-label">Tag / Boundary</label>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value as "personal" | "work" | "client")}
                  className="input"
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="client">Client (Guarded)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">API Key / Token (Optional)</label>
              <input
                type="password"
                placeholder="Stored in Windows Credential Manager"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="input input-mono"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                Leave blank if you prefer logging in via CLI browser OAuth.
              </p>
            </div>

            <DialogFooter className="pt-3 border-t border-border-subtle">
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
                disabled={submitting || !label.trim()}
              >
                {submitting ? "Creating…" : "Create Profile"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
