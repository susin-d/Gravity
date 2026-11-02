import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
  RotateCcw,
  Download,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";

interface Profile {
  id: string;
  label: string;
  vendor: "claude" | "codex";
  tag: "personal" | "work" | "client";
}

interface Project {
  id: string;
  name: string;
  path: string;
  tag: "personal" | "work" | "client";
}

interface SwitchEvent {
  id: string;
  session_id?: string;
  from_profile_id: string;
  to_profile_id: string;
  project_id?: string;
  reason: string;
  outcome: string;
  new_session_id?: string;
  switched_at: string;
  detail?: string;
}

interface LimitEvent {
  id: string;
  session_id?: string;
  profile_id: string;
  vendor: string;
  line?: string;
  exit_code?: number;
  detected_at: string;
}

interface Session {
  id: string;
  profile_id: string;
  project_id?: string;
  pid?: number;
  started_at: string;
  ended_at?: string;
  exit_code?: number;
  status: string;
}

interface TimelineItem {
  id: string;
  type: "switch" | "limit" | "session";
  timestamp: string;
  title: string;
  subtitle: string;
  badgeVariant: "success" | "destructive" | "warning" | "neutral" | "info";
  badgeText: string;
  detail?: string;
  projectId?: string;
  profileId?: string;
  raw: SwitchEvent | LimitEvent | Session;
}

export default function History() {
  const [switches, setSwitches] = useState<SwitchEvent[]>([]);
  const [limits, setLimits] = useState<LimitEvent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sw, lm, ss, pr, pj] = await Promise.all([
        invoke<SwitchEvent[]>("list_switch_events", { limit: 100 }),
        invoke<LimitEvent[]>("list_limit_events", { limit: 100 }),
        invoke<Session[]>("list_sessions"),
        invoke<Profile[]>("list_profiles"),
        invoke<Project[]>("list_projects"),
      ]);
      setSwitches(sw);
      setLimits(lm);
      setSessions(ss);
      setProfiles(pr);
      setProjects(pj);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const sw of switches) {
      const fromP = profileMap.get(sw.from_profile_id);
      const toP = profileMap.get(sw.to_profile_id);
      const proj = sw.project_id ? projectMap.get(sw.project_id) : undefined;
      const fromName = fromP ? `${fromP.label} (${fromP.vendor})` : "Unknown Profile";
      const toName = toP ? `${toP.label} (${toP.vendor})` : "Unknown Profile";
      const projName = proj ? proj.name : "Unregistered Project";

      let badgeVariant: TimelineItem["badgeVariant"] = "success";
      let badgeText = "Completed";
      if (sw.outcome === "blocked_client_auto") {
        badgeVariant = "destructive";
        badgeText = "Blocked: Client";
      } else if (sw.outcome === "cancelled") {
        badgeVariant = "neutral";
        badgeText = "Cancelled";
      } else if (sw.outcome === "confirmed_client_boundary") {
        badgeVariant = "info";
        badgeText = "Client Override";
      } else if (sw.outcome === "no_eligible") {
        badgeVariant = "warning";
        badgeText = "No Fallback";
      }

      items.push({
        id: `switch-${sw.id}`,
        type: "switch",
        timestamp: sw.switched_at,
        title:
          sw.outcome === "blocked_client_auto"
            ? `Auto-switch blocked on client boundary (${projName})`
            : `Profile switch: ${fromName} → ${toName}`,
        subtitle: `Reason: ${sw.reason.toUpperCase()} · Project: ${projName}`,
        badgeVariant,
        badgeText,
        detail: sw.detail,
        projectId: sw.project_id,
        profileId: sw.from_profile_id,
        raw: sw,
      });
    }

    for (const lm of limits) {
      const p = profileMap.get(lm.profile_id);
      const pName = p ? `${p.label} (${p.vendor})` : lm.profile_id;
      items.push({
        id: `limit-${lm.id}`,
        type: "limit",
        timestamp: lm.detected_at,
        title: `Rate limit detected (${lm.vendor})`,
        subtitle: `Profile: ${pName}${
          lm.exit_code !== undefined && lm.exit_code !== null
            ? ` · Exit Code: ${lm.exit_code}`
            : ""
        }`,
        badgeVariant: "warning",
        badgeText: "Rate Limited",
        detail: lm.line,
        profileId: lm.profile_id,
        raw: lm,
      });
    }

    for (const ss of sessions) {
      const p = profileMap.get(ss.profile_id);
      const proj = ss.project_id ? projectMap.get(ss.project_id) : undefined;
      const pName = p ? `${p.label} (${p.vendor})` : ss.profile_id;
      const projName = proj ? proj.name : "Ad-hoc";
      items.push({
        id: `session-${ss.id}`,
        type: "session",
        timestamp: ss.started_at,
        title: `CLI session started: ${pName}`,
        subtitle: `Project: ${projName} · PID: ${ss.pid ?? "Unknown"} · ${ss.status}`,
        badgeVariant: ss.status === "running" ? "info" : "neutral",
        badgeText: ss.status === "running" ? "Running" : "Exited",
        detail: ss.ended_at
          ? `Ended at ${new Date(ss.ended_at).toLocaleTimeString()}`
          : undefined,
        projectId: ss.project_id,
        profileId: ss.profile_id,
        raw: ss,
      });
    }

    return items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [switches, limits, sessions, profileMap, projectMap]);

  const filteredTimeline = useMemo(() => {
    return timeline.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (projectFilter !== "all" && item.projectId !== projectFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          (item.detail && item.detail.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [timeline, typeFilter, projectFilter, searchQuery]);

  const handleExportJson = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(filteredTimeline, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute(
      "download",
      `gravity-audit-${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const clientBlocksCount = switches.filter(
    (s) => s.outcome === "blocked_client_auto"
  ).length;
  const completedSwitchesCount = switches.filter(
    (s) => s.outcome === "completed"
  ).length;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-edge-subtle">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Audit Timeline & History
          </h2>
          <p className="text-xs text-ink-low mt-0.5">
            Immutable record of sessions, rate limits, and profile switches (Milestone M7)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadData}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleExportJson}
            disabled={filteredTimeline.length === 0}
            className="flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export JSON</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800/60 rounded-xl p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Sessions" value={sessions.length} valueClass="text-white" />
        <MetricCard label="Rate Limits" value={limits.length} valueClass="text-amber-400" />
        <MetricCard label="Switches Done" value={completedSwitchesCount} valueClass="text-emerald-400" />
        <MetricCard label="Client Blocks" value={clientBlocksCount} valueClass="text-red-400" />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-ink-low" />
            <span className="text-ink-low">Event:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-glass-1 border border-edge-DEFAULT text-ink-mid rounded-lg px-2.5 py-1 focus:outline-none focus:border-edge-strong"
            >
              <option value="all">All</option>
              <option value="switch">Switches</option>
              <option value="limit">Limits</option>
              <option value="session">Sessions</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-ink-low">Project:</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="bg-glass-1 border border-edge-DEFAULT text-ink-mid rounded-lg px-2.5 py-1 focus:outline-none focus:border-edge-strong"
            >
              <option value="all">All Projects</option>
              {projects.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[180px] relative">
            <Search className="h-3.5 w-3.5 text-ink-low absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events…"
              className="w-full bg-glass-1 border border-edge-DEFAULT text-ink-mid rounded-lg pl-8 pr-3 py-1 placeholder-ink-low focus:outline-none focus:border-edge-strong"
            />
          </div>

          {(typeFilter !== "all" || projectFilter !== "all" || searchQuery) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTypeFilter("all");
                setProjectFilter("all");
                setSearchQuery("");
              }}
              className="h-7 px-2 text-ink-low hover:text-ink-mid"
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="skeleton h-4 w-72 rounded" />
              <div className="skeleton h-3 w-48 rounded" />
            </div>
          ))}
        </div>
      ) : filteredTimeline.length === 0 ? (
        <div className="empty-state">
          <p className="text-ink-mid text-sm font-medium">No events recorded</p>
          <p className="text-ink-low text-xs mt-1">
            Launch sessions or trigger profile switches to view audit entries.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredTimeline.map((item) => (
            <motion.div
              key={item.id}
              whileHover={{ y: -1 }}
              transition={{ duration: 0.1 }}
              className="card p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-white">
                      {item.title}
                    </span>
                    <Badge variant={item.badgeVariant}>{item.badgeText}</Badge>
                  </div>
                  <p className="text-xs text-ink-low">{item.subtitle}</p>
                </div>
                <div className="text-right text-[11px] text-ink-low font-mono whitespace-nowrap flex-shrink-0">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>
              {item.detail && (
                <div className="bg-glass-1 border border-edge-subtle rounded-lg p-2.5 text-xs font-mono text-ink-low break-all">
                  {item.detail}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <Card className="p-4">
      <span className="text-[10px] text-ink-low uppercase tracking-wider font-semibold block mb-1">
        {label}
      </span>
      <p className={`text-2xl font-semibold ${valueClass}`}>{value}</p>
    </Card>
  );
}
