import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

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
  badgeText: string;
  badgeStyle: string;
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

  // Filters
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

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Merge into unified chronological timeline
  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // 1. Switch Events
    for (const sw of switches) {
      const fromP = profileMap.get(sw.from_profile_id);
      const toP = profileMap.get(sw.to_profile_id);
      const proj = sw.project_id ? projectMap.get(sw.project_id) : undefined;

      const fromName = fromP ? `${fromP.label} (${fromP.vendor})` : "Unknown Profile";
      const toName = toP ? `${toP.label} (${toP.vendor})` : "Unknown Profile";
      const projName = proj ? proj.name : "Unregistered Project";

      let badgeStyle = "bg-green-950/60 text-green-300 border-green-800";
      let badgeText = "Completed";

      if (sw.outcome === "blocked_client_auto") {
        badgeStyle = "bg-red-950/80 text-red-300 border-red-700";
        badgeText = "🛡️ Blocked: Client Boundary";
      } else if (sw.outcome === "cancelled") {
        badgeStyle = "bg-gray-800 text-gray-400 border-gray-700";
        badgeText = "Cancelled";
      } else if (sw.outcome === "confirmed_client_boundary") {
        badgeStyle = "bg-purple-950/70 text-purple-300 border-purple-800";
        badgeText = "Client Override";
      } else if (sw.outcome === "no_eligible") {
        badgeStyle = "bg-amber-950/60 text-amber-300 border-amber-800";
        badgeText = "No Fallback";
      }

      items.push({
        id: `switch-${sw.id}`,
        type: "switch",
        timestamp: sw.switched_at,
        title: sw.outcome === "blocked_client_auto"
          ? `Auto-Switch Blocked on Client Boundary (${projName})`
          : `Profile Switch: ${fromName} → ${toName}`,
        subtitle: `Reason: ${sw.reason.toUpperCase()} · Project: ${projName}`,
        badgeText,
        badgeStyle,
        detail: sw.detail,
        projectId: sw.project_id,
        profileId: sw.from_profile_id,
        raw: sw,
      });
    }

    // 2. Limit Events
    for (const lm of limits) {
      const p = profileMap.get(lm.profile_id);
      const pName = p ? `${p.label} (${p.vendor})` : lm.profile_id;

      items.push({
        id: `limit-${lm.id}`,
        type: "limit",
        timestamp: lm.detected_at,
        title: `Rate Limit Detected (${lm.vendor})`,
        subtitle: `Profile: ${pName}${lm.exit_code !== undefined && lm.exit_code !== null ? ` · Exit Code: ${lm.exit_code}` : ""}`,
        badgeText: "Rate Limited",
        badgeStyle: "bg-amber-950/70 text-amber-300 border-amber-800",
        detail: lm.line,
        profileId: lm.profile_id,
        raw: lm,
      });
    }

    // 3. Sessions
    for (const ss of sessions) {
      const p = profileMap.get(ss.profile_id);
      const proj = ss.project_id ? projectMap.get(ss.project_id) : undefined;

      const pName = p ? `${p.label} (${p.vendor})` : ss.profile_id;
      const projName = proj ? proj.name : "Ad-hoc Session";

      items.push({
        id: `session-${ss.id}`,
        type: "session",
        timestamp: ss.started_at,
        title: `CLI Session Started: ${pName}`,
        subtitle: `Project: ${projName} · PID: ${ss.pid ?? "Unknown"} · Status: ${ss.status}`,
        badgeText: ss.status === "running" ? "Running" : "Exited",
        badgeStyle: ss.status === "running"
          ? "bg-blue-950/70 text-blue-300 border-blue-800"
          : "bg-gray-800 text-gray-400 border-gray-700",
        detail: ss.ended_at ? `Session ended at ${new Date(ss.ended_at).toLocaleTimeString()}` : undefined,
        projectId: ss.project_id,
        profileId: ss.profile_id,
        raw: ss,
      });
    }

    // Sort descending by timestamp
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [switches, limits, sessions, profileMap, projectMap]);

  // Filtered view
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

  // Export audit log as JSON file
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredTimeline, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `gravity-audit-log-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Metric stats
  const clientBlocksCount = switches.filter((s) => s.outcome === "blocked_client_auto").length;
  const completedSwitchesCount = switches.filter((s) => s.outcome === "completed").length;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <span>📜</span> Audit Timeline & History
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Immutable audit record of sessions, rate limits, and profile switches (Milestone M7)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors border border-gray-700"
            title="Refresh timeline"
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            disabled={filteredTimeline.length === 0}
            className="px-3 py-1.5 bg-gravity-950 hover:bg-gravity-900 border border-gravity-700 text-gravity-300 text-xs rounded-lg transition-colors font-medium disabled:opacity-40"
          >
            Export JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-1">
          <span className="text-gray-500 uppercase text-[10px] font-semibold tracking-wider">Total Sessions</span>
          <p className="text-xl font-bold text-gray-200">{sessions.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-1">
          <span className="text-gray-500 uppercase text-[10px] font-semibold tracking-wider">Rate Limits</span>
          <p className="text-xl font-bold text-amber-400">{limits.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-1">
          <span className="text-gray-500 uppercase text-[10px] font-semibold tracking-wider">Switches Completed</span>
          <p className="text-xl font-bold text-green-400">{completedSwitchesCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 space-y-1">
          <span className="text-gray-500 uppercase text-[10px] font-semibold tracking-wider">Client Shield Blocks</span>
          <p className="text-xl font-bold text-red-400">{clientBlocksCount}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs">
        {/* Type Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Event:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-gray-950 border border-gray-800 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-gravity-500"
          >
            <option value="all">All Events</option>
            <option value="switch">Switches Only</option>
            <option value="limit">Limits Only</option>
            <option value="session">Sessions Only</option>
          </select>
        </div>

        {/* Project Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">Project:</span>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-gray-950 border border-gray-800 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-gravity-500"
          >
            <option value="all">All Projects</option>
            {projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name} ({pr.tag})
              </option>
            ))}
          </select>
        </div>

        {/* Search Query */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search timeline events..."
            className="w-full bg-gray-950 border border-gray-800 text-gray-300 rounded px-3 py-1 text-xs placeholder-gray-600 focus:outline-none focus:border-gravity-500"
          />
        </div>

        {(typeFilter !== "all" || projectFilter !== "all" || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all");
              setProjectFilter("all");
              setSearchQuery("");
            }}
            className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Timeline Items */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading audit timeline…</div>
      ) : filteredTimeline.length === 0 ? (
        <div className="p-12 text-center bg-gray-900 border border-gray-800 rounded-xl text-gray-500 text-sm space-y-1">
          <p className="font-semibold text-gray-400">No events recorded</p>
          <p className="text-xs text-gray-600">
            Launch sessions or trigger profile switches to view live audit entries.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTimeline.map((item) => (
            <div
              key={item.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-200">{item.title}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${item.badgeStyle}`}>
                      {item.badgeText}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{item.subtitle}</p>
                </div>

                <div className="text-right text-[11px] text-gray-500 font-mono whitespace-nowrap">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>

              {item.detail && (
                <div className="bg-gray-950 border border-gray-800/80 rounded-lg p-2.5 text-xs font-mono text-gray-400 break-all">
                  {item.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
