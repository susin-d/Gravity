import { useCallback, useEffect, useState } from "react";
import { Activity, ClipboardCopy, RefreshCw } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type {
  LimitEvent,
  Session,
  SessionStatus,
  SwitchEvent,
  SwitchOutcome,
} from "../lib/types";
import {
  formatDateTime,
  formatDuration,
  outcomeLabel,
  reasonLabel,
  shortId,
  statusLabel,
} from "../lib/format";
import { useAppData } from "../state/AppData";
import { Badge, type BadgeVariant } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { SegmentedFilter } from "../components/ui/segmented-filter";
import { SkeletonRows } from "../components/ui/skeleton";
import { PageHeader } from "../components/layout/page-header";
import {
  Table,
  TableShell,
  tableHeadRow,
  tableRow,
  td,
  th,
} from "../components/ui/table";
import { useToast } from "../components/ui/toast";

type ActivityTab = "sessions" | "switches" | "limits";

const tabs = [
  { value: "sessions" as const, label: "Sessions" },
  { value: "switches" as const, label: "Switches" },
  { value: "limits" as const, label: "Rate limits" },
];

const statusVariants: Record<SessionStatus, BadgeVariant> = {
  running: "success",
  ended: "neutral",
  crashed: "danger",
  killed: "warning",
};

const outcomeVariants: Record<SwitchOutcome, BadgeVariant> = {
  completed: "success",
  cancelled: "neutral",
  confirmed_client_boundary: "warning",
  blocked_client_auto: "danger",
  no_eligible: "neutral",
};

export function ActivityPage() {
  const { sessions, profiles, projects, loading, refresh } = useAppData();
  const { toast } = useToast();

  const [tab, setTab] = useState<ActivityTab>("sessions");
  const [switches, setSwitches] = useState<SwitchEvent[]>([]);
  const [limits, setLimits] = useState<LimitEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const [nextSwitches, nextLimits] = await Promise.all([
        api.listSwitchEvents(200),
        api.listLimitEvents(200),
      ]);
      setSwitches(nextSwitches);
      setLimits(nextLimits);
      setEventsError(null);
    } catch (cause) {
      setEventsError(errorMessage(cause));
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const profileName = (profileId: string) =>
    profiles.find((profile) => profile.id === profileId)?.label ??
    `Removed profile (${shortId(profileId)})`;

  const projectName = (projectId: string | null) =>
    projectId
      ? (projects.find((project) => project.id === projectId)?.name ??
        `Removed project (${shortId(projectId)})`)
      : "Home directory";

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refresh(), loadEvents()]);
    setRefreshing(false);
  }

  async function handleCopy() {
    const rows: Array<Session | SwitchEvent | LimitEvent> =
      tab === "sessions" ? sessions : tab === "switches" ? switches : limits;
    try {
      await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      toast({ variant: "success", title: "Copied activity as JSON" });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not copy activity",
        description: errorMessage(cause),
      });
    }
  }

  const busy = loading || eventsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Every session, profile switch, and reported rate limit Gravity has recorded. History is append-only."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleCopy()}
              disabled={busy}
            >
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
              Copy JSON
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRefresh()}
              loading={refreshing}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </Button>
          </>
        }
      />

      <SegmentedFilter
        value={tab}
        options={tabs}
        onChange={setTab}
        ariaLabel="Activity type"
      />

      {eventsError && (
        <p role="alert" className="text-xs text-danger-text">
          {eventsError}
        </p>
      )}

      {busy ? (
        <SkeletonRows rows={6} />
      ) : tab === "sessions" ? (
        sessions.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No sessions recorded"
            description="Launch a session and it appears here with its profile, project, and outcome."
          />
        ) : (
          <TableShell>
            <Table>
              <thead>
                <tr className={tableHeadRow}>
                  <th scope="col" className={th}>Started</th>
                  <th scope="col" className={th}>Profile</th>
                  <th scope="col" className={th}>Project</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Duration</th>
                  <th scope="col" className={th}>Exit</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className={tableRow}>
                    <td className={`${td} whitespace-nowrap text-ink-muted`}>
                      {formatDateTime(session.started_at)}
                    </td>
                    <td className={td}>{profileName(session.profile_id)}</td>
                    <td className={`${td} text-ink-muted`}>
                      {projectName(session.project_id)}
                    </td>
                    <td className={td}>
                      <Badge variant={statusVariants[session.status]}>
                        {statusLabel(session.status)}
                      </Badge>
                    </td>
                    <td className={`${td} font-mono text-xs text-ink-muted`}>
                      {formatDuration(session.started_at, session.ended_at)}
                    </td>
                    <td className={`${td} font-mono text-xs text-ink-dim`}>
                      {session.exit_code ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableShell>
        )
      ) : tab === "switches" ? (
        switches.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No switches recorded"
            description="Manual switches, rate-limit switches, and client boundary decisions are recorded here."
          />
        ) : (
          <TableShell>
            <Table>
              <thead>
                <tr className={tableHeadRow}>
                  <th scope="col" className={th}>When</th>
                  <th scope="col" className={th}>Switch</th>
                  <th scope="col" className={th}>Project</th>
                  <th scope="col" className={th}>Reason</th>
                  <th scope="col" className={th}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {switches.map((event) => (
                  <tr key={event.id} className={tableRow}>
                    <td className={`${td} whitespace-nowrap text-ink-muted`}>
                      {formatDateTime(event.switched_at)}
                    </td>
                    <td className={td}>
                      <span className="text-ink-muted">
                        {profileName(event.from_profile_id)}
                      </span>
                      <span className="px-1.5 text-ink-dim" aria-hidden>
                        →
                      </span>
                      <span className="text-ink">{profileName(event.to_profile_id)}</span>
                    </td>
                    <td className={`${td} text-ink-muted`}>
                      {projectName(event.project_id)}
                    </td>
                    <td className={`${td} text-ink-muted`}>
                      {reasonLabel(event.reason)}
                    </td>
                    <td className={td}>
                      <Badge variant={outcomeVariants[event.outcome]}>
                        {outcomeLabel(event.outcome)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableShell>
        )
      ) : limits.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No rate limits reported"
          description="When a provider rate limit stops you, report it from a running session. Gravity records the event and offers a switch."
        />
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr className={tableHeadRow}>
                <th scope="col" className={th}>When</th>
                <th scope="col" className={th}>Profile</th>
                <th scope="col" className={th}>Session</th>
                <th scope="col" className={th}>Source</th>
                <th scope="col" className={th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {limits.map((event) => (
                <tr key={event.id} className={tableRow}>
                  <td className={`${td} whitespace-nowrap text-ink-muted`}>
                    {formatDateTime(event.detected_at)}
                  </td>
                  <td className={td}>{profileName(event.profile_id)}</td>
                  <td className={`${td} font-mono text-xs text-ink-dim`}>
                    {shortId(event.session_id)}
                  </td>
                  <td className={`${td} text-ink-muted`}>{event.source}</td>
                  <td className={`${td} text-ink-muted`}>
                    {event.detail ?? event.raw_signal}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableShell>
      )}
    </div>
  );
}
