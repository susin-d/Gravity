import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Clock, RefreshCw, AlertCircle, CheckCircle, XCircle } from "lucide-react";

export interface SwitchEventSummary {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  reason: string;
  outcome: string;
  switched_at: string;
}

interface HistoryPanelProps {
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
}

export default function HistoryPanel({
  selectedEventId,
  onSelectEvent,
}: HistoryPanelProps) {
  const [events, setEvents] = useState<SwitchEventSummary[]>([]);
  const [filter, setFilter] = useState<"all" | "completed" | "cancelled" | "blocked">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await invoke<SwitchEventSummary[]>("list_switch_events", { limit: 30 });
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "blocked") {
      return events.filter((e) => e.outcome === "blocked_client_auto");
    }
    return events.filter((e) => e.outcome === filter);
  }, [events, filter]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-subtle px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-white" />
          <span className="text-xs font-semibold text-white">Switch Audit Trail</span>
        </div>
        <button
          type="button"
          onClick={loadEvents}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-edge-subtle bg-glass-2 text-ink-high hover:border-edge-DEFAULT hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-edge-subtle p-2 flex items-center gap-1 text-[10px] bg-glass-1">
        {(["all", "completed", "cancelled", "blocked"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-2 py-0.5 capitalize transition-colors ${
              filter === f
                ? "bg-white text-black font-semibold"
                : "text-ink-low hover:bg-glass-2 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {error ? (
          <div className="px-2 py-4 text-center text-[11px] text-rose-300">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-ink-low">
            {loading ? "Loading events..." : "No events recorded"}
          </div>
        ) : (
          filtered.map((ev) => {
            const isSelected = ev.id === selectedEventId;
            const isSuccess = ev.outcome === "completed";
            const isBlocked = ev.outcome === "blocked_client_auto";

            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => onSelectEvent(ev.id)}
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-all ${
                  isSelected
                    ? "bg-[#181818] border border-edge-DEFAULT text-white shadow-md"
                    : "text-ink-mid hover:bg-glass-2 hover:text-white border border-transparent"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="truncate text-xs font-medium capitalize">
                    {ev.reason.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono border ${
                      isSuccess
                        ? "border-emerald-500/30 text-emerald-300 bg-emerald-950/20"
                        : isBlocked
                        ? "border-rose-500/30 text-rose-300 bg-rose-950/20"
                        : "border-amber-500/30 text-amber-300 bg-amber-950/20"
                    }`}
                  >
                    {isSuccess ? (
                      <CheckCircle className="h-2.5 w-2.5" />
                    ) : isBlocked ? (
                      <AlertCircle className="h-2.5 w-2.5" />
                    ) : (
                      <XCircle className="h-2.5 w-2.5" />
                    )}
                    {ev.outcome}
                  </span>
                </div>
                <span className="mt-1 font-mono text-[10px] text-ink-low">
                  {new Date(ev.switched_at).toLocaleTimeString()}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-edge-subtle px-3 py-2 text-[10px] text-ink-low font-mono flex justify-between">
        <span>{filtered.length} events</span>
        <span>Append-only</span>
      </div>
    </div>
  );
}
