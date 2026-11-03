import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  FolderKanban,
  Play,
  RefreshCw,
  Square,
  Terminal,
  Users,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { Profile, Session, SwitchExecutionResult } from "../lib/types";
import {
  formatDuration,
  formatRelative,
  outcomeLabel,
  tagLabel,
  vendorLabel,
} from "../lib/format";
import type { PageId } from "../lib/navigation";
import { useAppData } from "../state/AppData";
import { Badge, tagBadgeVariant, vendorBadgeVariant } from "../components/ui/badge";
import { Banner } from "../components/ui/banner";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { EmptyState } from "../components/ui/empty-state";
import { Field, Select } from "../components/ui/field";
import { PageHeader } from "../components/layout/page-header";
import {
  Table,
  TableShell,
  tableHeadRow,
  tableRow,
  td,
  th,
} from "../components/ui/table";
import { UsageBadge } from "../components/ui/usage-badge";
import { useToast } from "../components/ui/toast";
import { ProfileDialog } from "../components/profile-dialog";
import { ClientBoundaryModal } from "../components/client-boundary-modal";
import {
  SwitchProfileDialog,
  type ClientSwitchRequest,
} from "../components/switch-profile-dialog";

export interface LaunchPageProps {
  onNavigate: (page: PageId) => void;
}

export function LaunchPage({ onNavigate }: LaunchPageProps) {
  const {
    profiles,
    projects,
    sessions,
    usages,
    terminalAvailable,
    launchProjectId,
    launchProfileId,
    setLaunchProject,
    setLaunchProfile,
    refresh,
    refreshUsage,
  } = useAppData();
  const { toast } = useToast();

  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [refreshingUsage, setRefreshingUsage] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [pendingClientLaunch, setPendingClientLaunch] = useState<Profile | null>(null);
  const [stopTarget, setStopTarget] = useState<Session | null>(null);
  const [switchSession, setSwitchSession] = useState<Session | null>(null);
  const [clientSwitch, setClientSwitch] = useState<ClientSwitchRequest | null>(null);
  const [clientSwitchLoading, setClientSwitchLoading] = useState(false);

  const selectedProfile =
    profiles.find((profile) => profile.id === launchProfileId) ?? null;
  const selectedProject =
    projects.find((project) => project.id === launchProjectId) ?? null;
  const runningSessions = sessions.filter((session) => session.status === "running");

  const projectName = (projectId: string | null) =>
    projectId
      ? (projects.find((project) => project.id === projectId)?.name ?? "Removed project")
      : "Home directory";

  const profileName = (profileId: string) =>
    profiles.find((profile) => profile.id === profileId)?.label ?? "Removed profile";

  async function handleRefreshUsage() {
    if (!selectedProfile) return;
    setRefreshingUsage(true);
    try {
      const reading = await refreshUsage(selectedProfile.id);
      toast({
        variant: "info",
        title: "Usage check complete",
        description: reading.detail ?? "No verified reading is available.",
      });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not check usage",
        description: errorMessage(cause),
      });
    } finally {
      setRefreshingUsage(false);
    }
  }

  async function handleRefreshSessions() {
    setRefreshingSessions(true);
    await refresh();
    setRefreshingSessions(false);
  }

  async function spawnSession(profile: Profile, clientConfirmed: boolean) {
    setLaunching(true);
    try {
      await api.spawnSession({
        profile_id: profile.id,
        project_path: null,
        project_id: selectedProject?.id ?? null,
        client_confirmed: clientConfirmed,
      });
      setPendingClientLaunch(null);
      await refresh();
      toast({
        variant: "success",
        title: "Session started",
        description: `${profile.label} · ${selectedProject?.name ?? "Home directory"}`,
      });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not start the session",
        description: errorMessage(cause),
      });
    } finally {
      setLaunching(false);
    }
  }

  function handleLaunch() {
    if (!selectedProfile) return;
    if (selectedProfile.tag === "client") {
      setPendingClientLaunch(selectedProfile);
      return;
    }
    void spawnSession(selectedProfile, false);
  }

  async function handleStop() {
    if (!stopTarget) return;
    setBusySessionId(stopTarget.id);
    try {
      await api.stopSession(stopTarget.id);
      setStopTarget(null);
      await refresh();
      toast({ variant: "success", title: "Session stopped" });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not stop the session",
        description: errorMessage(cause),
      });
    } finally {
      setBusySessionId(null);
    }
  }

  async function handleReportLimit(session: Session) {
    setBusySessionId(session.id);
    try {
      const result = await api.reportRateLimit(session.id);
      await refresh();

      if (result.auto_switch) {
        const event = result.auto_switch;
        toast({
          variant: event.outcome === "completed" ? "success" : "info",
          title: outcomeLabel(event.outcome),
          description:
            event.from_profile_id === event.to_profile_id
              ? (event.detail ?? "No profile change was made.")
              : `${profileName(event.from_profile_id)} → ${profileName(event.to_profile_id)}`,
        });
        return;
      }

      toast({
        variant: "info",
        title: "Rate limit recorded",
        description: "Pick a profile to continue in a fresh session.",
      });
      setSwitchSession(session);
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not record the rate limit",
        description: errorMessage(cause),
      });
    } finally {
      setBusySessionId(null);
    }
  }

  async function handleClientSwitchConfirm() {
    if (!clientSwitch) return;
    setClientSwitchLoading(true);
    try {
      await api.executeProfileSwitch({
        sessionId: clientSwitch.session.id,
        fromProfileId: clientSwitch.fromProfile.id,
        toProfileId: clientSwitch.toProfile.id,
        projectId: clientSwitch.session.project_id,
        reason: "manual",
        clientConfirmed: true,
      });
      setClientSwitch(null);
      await refresh();
      toast({
        variant: "success",
        title: "Switched profile",
        description: `${clientSwitch.fromProfile.label} → ${clientSwitch.toProfile.label}`,
      });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not switch profile",
        description: errorMessage(cause),
      });
    } finally {
      setClientSwitchLoading(false);
    }
  }

  async function handleClientSwitchCancel() {
    if (!clientSwitch) return;
    const request = clientSwitch;
    setClientSwitch(null);
    try {
      await api.recordSwitchCancellation({
        sessionId: request.session.id,
        fromProfileId: request.fromProfile.id,
        toProfileId: request.toProfile.id,
        projectId: request.session.project_id,
        reason: "manual",
        detail: "Cancelled at the client boundary confirmation",
      });
      toast({ variant: "info", title: "Switch cancelled" });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not record the cancellation",
        description: errorMessage(cause),
      });
    }
  }

  function handleSwitched(result: SwitchExecutionResult) {
    void refresh();
    const target = result.new_session
      ? profileName(result.new_session.profile_id)
      : "new profile";
    toast({
      variant: "success",
      title: "Switched profile",
      description: `A new session is running with ${target}.`,
    });
  }

  if (profiles.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Launch"
          description="Start an isolated Claude Code or Codex session in a project folder."
        />
        <EmptyState
          icon={Users}
          title="Create your first profile"
          description="A profile binds a vendor, a boundary tag, and its own config directory. Gravity passes only that profile's environment to the CLI."
          action={
            <Button variant="primary" size="sm" onClick={() => setProfileDialogOpen(true)}>
              Create profile
            </Button>
          }
        />
        <ProfileDialog
          open={profileDialogOpen}
          onOpenChange={setProfileDialogOpen}
          onSaved={() => void refresh()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch"
        description="Start an isolated Claude Code or Codex session in a project folder."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-lg border border-line bg-panel">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">New session</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Each session gets a clean environment and its own Job Object.
            </p>
          </div>

          <div className="space-y-4 p-4">
            <Field
              id="launch-project"
              label="Project"
              hint={
                projects.length === 0
                  ? "No projects registered yet. This session starts in your home directory."
                  : "Sessions open in the project folder."
              }
            >
              <Select
                id="launch-project"
                value={launchProjectId ?? ""}
                onChange={(event) => setLaunchProject(event.target.value || null)}
              >
                <option value="">Home directory</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>

            {projects.length === 0 && (
              <button
                type="button"
                onClick={() => onNavigate("projects")}
                className="inline-flex items-center gap-1.5 text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                <FolderKanban className="h-3.5 w-3.5" aria-hidden />
                Add a project
              </button>
            )}

            <Field
              id="launch-profile"
              label="Profile"
              hint={
                selectedProfile
                  ? `${vendorLabel(selectedProfile.vendor)} · ${tagLabel(selectedProfile.tag)} boundary`
                  : undefined
              }
            >
              <Select
                id="launch-profile"
                value={launchProfileId ?? ""}
                onChange={(event) => setLaunchProfile(event.target.value || null)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label} — {vendorLabel(profile.vendor)} · {tagLabel(profile.tag)}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedProject?.terminal === "wt" && terminalAvailable === false && (
              <Banner variant="warning" title="Windows Terminal is required by this project">
                wt.exe was not found on PATH. Change the project terminal to Auto or
                PowerShell before launching.
              </Banner>
            )}

            {selectedProfile?.tag === "client" && (
              <Banner variant="warning" title="Client boundary">
                This profile is tagged client. Gravity asks for confirmation before it
                starts, and it can never be auto-switched.
              </Banner>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-dim">
                <Terminal className="h-3.5 w-3.5" aria-hidden />
                {selectedProject?.terminal === "wt"
                  ? terminalAvailable === false
                    ? "Windows Terminal (not found)"
                    : "Windows Terminal"
                  : terminalAvailable === false
                    ? "PowerShell (Windows Terminal not found)"
                    : selectedProject?.terminal === "powershell"
                      ? "PowerShell"
                      : "Windows Terminal"}
              </span>
              <Button
                variant="primary"
                onClick={handleLaunch}
                loading={launching}
                disabled={!selectedProfile}
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                Launch session
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Usage</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {selectedProfile ? selectedProfile.label : "Select a profile"}
              </p>
            </div>
          </div>

          {selectedProfile ? (
            <UsageBadge
              reading={usages[selectedProfile.id]}
              onRefresh={handleRefreshUsage}
              refreshing={refreshingUsage}
            />
          ) : (
            <p className="text-xs text-ink-muted">Select a profile to inspect usage.</p>
          )}

          <p className="text-[11px] leading-relaxed text-ink-dim">
            Gravity never guesses a usage percentage. Readings stay Unknown unless a
            provider exposes a verifiable number.
          </p>
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">Running sessions</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Sessions are killed with Gravity because they belong to its Job Objects.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRefreshSessions()}
              loading={refreshingSessions}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </Button>
            <Badge variant={runningSessions.length > 0 ? "success" : "neutral"}>
              {runningSessions.length} running
            </Badge>
          </div>
        </div>

        {runningSessions.length === 0 ? (
          <EmptyState
            icon={Terminal}
            title="No running sessions"
            description="Launch a session above to start working. Running sessions appear here with stop, switch, and rate-limit actions."
          />
        ) : (
          <TableShell>
            <Table>
              <thead>
                <tr className={tableHeadRow}>
                  <th scope="col" className={th}>Profile</th>
                  <th scope="col" className={th}>Project</th>
                  <th scope="col" className={th}>Started</th>
                  <th scope="col" className={th}>Duration</th>
                  <th scope="col" className={th}>PID</th>
                  <th scope="col" className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runningSessions.map((session) => {
                  const profile = profiles.find(
                    (candidate) => candidate.id === session.profile_id,
                  );
                  const busy = busySessionId === session.id;
                  return (
                    <tr key={session.id} className={tableRow}>
                      <td className={td}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-ink">
                            {profile?.label ?? "Removed profile"}
                          </span>
                          {profile && (
                            <>
                              <Badge variant={vendorBadgeVariant(profile.vendor)}>
                                {vendorLabel(profile.vendor)}
                              </Badge>
                              <Badge variant={tagBadgeVariant(profile.tag)}>
                                {tagLabel(profile.tag)}
                              </Badge>
                            </>
                          )}
                        </div>
                      </td>
                      <td className={`${td} text-ink-muted`}>
                        {projectName(session.project_id)}
                      </td>
                      <td className={`${td} text-ink-muted`} title={session.started_at}>
                        {formatRelative(session.started_at)}
                      </td>
                      <td className={`${td} font-mono text-xs text-ink-muted`}>
                        {formatDuration(session.started_at, null)}
                      </td>
                      <td className={`${td} font-mono text-xs text-ink-dim`}>
                        {session.pid ?? "—"}
                      </td>
                      <td className={`${td}`}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            onClick={() => void handleReportLimit(session)}
                            aria-label={`Report rate limit for ${profile?.label ?? "this session"}`}
                            title="Report rate limit"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSwitchSession(session)}
                            aria-label={`Switch profile for ${profile?.label ?? "this session"}`}
                            title="Switch profile"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            onClick={() => setStopTarget(session)}
                            aria-label={`Stop ${profile?.label ?? "this"} session`}
                            title="Stop session"
                          >
                            <Square className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableShell>
        )}
      </section>

      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        onSaved={() => void refresh()}
      />

      <ClientBoundaryModal
        open={pendingClientLaunch != null}
        targetProfile={pendingClientLaunch ?? profiles[0]}
        projectName={selectedProject?.name ?? null}
        loading={launching}
        onConfirm={() => {
          if (pendingClientLaunch) void spawnSession(pendingClientLaunch, true);
        }}
        onCancel={() => setPendingClientLaunch(null)}
      />

      <SwitchProfileDialog
        open={switchSession != null}
        onOpenChange={(open) => {
          if (!open) setSwitchSession(null);
        }}
        session={switchSession}
        onRequestClientConfirm={(request) => {
          setSwitchSession(null);
          setClientSwitch(request);
        }}
        onSwitched={handleSwitched}
        onManageProfiles={() => onNavigate("profiles")}
      />

      <ClientBoundaryModal
        open={clientSwitch != null}
        targetProfile={clientSwitch?.toProfile ?? profiles[0]}
        fromProfile={clientSwitch?.fromProfile ?? null}
        projectName={
          clientSwitch ? projectName(clientSwitch.session.project_id) : null
        }
        loading={clientSwitchLoading}
        onConfirm={() => void handleClientSwitchConfirm()}
        onCancel={() => void handleClientSwitchCancel()}
      />

      <ConfirmDialog
        open={stopTarget != null}
        onOpenChange={(open) => {
          if (!open) setStopTarget(null);
        }}
        title="Stop this session?"
        description="Gravity terminates the session's Job Object. The terminal and the CLI process close immediately. The session stays in Activity as stopped."
        confirmLabel="Stop session"
        loading={busySessionId === stopTarget?.id}
        onConfirm={() => void handleStop()}
      />
    </div>
  );
}
