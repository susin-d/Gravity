import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";

interface AdaptersHealthReport {
  claude: "ok" | "degraded";
  codex: "ok" | "degraded";
}

interface LimitEvent {
  id: string;
  session_id: string;
  profile_id: string;
  detected_at: string;
  source: string;
  raw_signal: string;
  detail?: string;
}

interface AdapterHealthProps {
  selectedAdapter?: "claude" | "codex" | null;
}

export default function AdapterHealth({
  selectedAdapter,
}: AdapterHealthProps = {}) {
  const [health, setHealth] = useState<AdaptersHealthReport | null>(null);
  const [limitEvents, setLimitEvents] = useState<LimitEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [h, events] = await Promise.all([
        invoke<AdaptersHealthReport>("check_adapters_health"),
        invoke<LimitEvent[]>("list_limit_events", { limit: 20 }),
      ]);
      setHealth(h);
      setLimitEvents(events);
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

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Adapter Health</h2>
          <p className="text-xs text-ink-low mt-0.5">
            Local CLI probe for Claude Code and OpenAI Codex, plus recorded limit telemetry.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

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

      {/* Health cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AdapterCard
          title="Claude Code CLI Adapter"
          vendor="claude"
          status={health?.claude ?? null}
          description="Parses CLI output for token quota exhaustion, credit balance alerts, and exit codes."
          loading={loading}
          selected={selectedAdapter === "claude"}
        />
        <AdapterCard
          title="OpenAI Codex CLI Adapter"
          vendor="codex"
          status={health?.codex ?? null}
          description="Detects Codex request limits, insufficient_quota errors, and API rejections."
          loading={loading}
          selected={selectedAdapter === "codex"}
        />
      </div>

      {/* Limit Events Table */}
      <div>
        <h3 className="section-heading mb-3">Recorded Rate Limit Events</h3>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 rounded-xl" />
            ))}
          </div>
        ) : limitEvents.length === 0 ? (
          <div className="empty-state py-8">
            <p className="text-ink-low text-xs">No rate limit events recorded yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-glass-1 text-ink-low uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Detected At</th>
                  <th className="p-3">Profile ID</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Raw Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {limitEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-glass-3 transition-colors">
                    <td className="p-3 text-ink-low flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-ink-low" />
                      {new Date(evt.detected_at).toLocaleTimeString()}
                    </td>
                    <td className="p-3 text-ink-mid">{evt.profile_id.slice(0, 8)}…</td>
                    <td className="p-3">
                      <Badge variant="warning" className="uppercase text-[10px]">{evt.source}</Badge>
                    </td>
                    <td className="p-3 text-ink-mid truncate max-w-xs" title={evt.raw_signal}>
                      {evt.raw_signal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdapterCard({
  title,
  vendor,
  status,
  description,
  loading,
  selected,
}: {
  title: string;
  vendor: string;
  status: "ok" | "degraded" | null;
  description: string;
  loading?: boolean;
  selected?: boolean;
}) {
  const isOk = status === "ok";

  return (
    <Card className={`p-5 space-y-3 transition-all ${selected ? "border-white/40 shadow-glow bg-[#181818]" : ""}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-white text-sm">{title}</h4>
        {loading ? (
          <div className="skeleton h-5 w-20 rounded" />
        ) : status === null ? (
          <Badge variant="neutral">Unavailable</Badge>
        ) : (
          <Badge variant={isOk ? "success" : "destructive"}>
            {isOk ? "CLI detected" : "CLI missing"}
          </Badge>
        )}
      </div>
      <p className="text-xs text-ink-mid leading-relaxed">{description}</p>
      <div className="pt-2 border-t border-edge-subtle text-[11px] text-ink-low font-mono">
        Vendor ID: <span className="text-ink-mid">{vendor}</span>
      </div>
    </Card>
  );
}
