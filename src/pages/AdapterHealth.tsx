import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Clock,
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

export default function AdapterHealth() {
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
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Adapter Health</h2>
        <p className="text-xs text-text-tertiary mt-0.5">
          Real-time parser status and recorded limit telemetry for Claude Code and OpenAI Codex.
        </p>
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
          status={health?.claude || "ok"}
          description="Parses stdout/stderr for token quota exhaustion, credit balance alerts, and exit codes."
          loading={loading}
        />
        <AdapterCard
          title="OpenAI Codex CLI Adapter"
          vendor="codex"
          status={health?.codex || "ok"}
          description="Monitors Codex requests per minute limits, insufficient_quota errors, and API rejections."
          loading={loading}
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
            <p className="text-text-tertiary text-xs">No rate limit events recorded yet.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-surface-1 text-text-tertiary uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Detected At</th>
                  <th className="p-3">Profile ID</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Raw Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {limitEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-surface-3 transition-colors">
                    <td className="p-3 text-text-tertiary flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-text-tertiary" />
                      {new Date(evt.detected_at).toLocaleTimeString()}
                    </td>
                    <td className="p-3 text-text-secondary">{evt.profile_id.slice(0, 8)}…</td>
                    <td className="p-3">
                      <Badge variant="warning" className="uppercase text-[10px]">{evt.source}</Badge>
                    </td>
                    <td className="p-3 text-text-secondary truncate max-w-xs" title={evt.raw_signal}>
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
}: {
  title: string;
  vendor: string;
  status: "ok" | "degraded";
  description: string;
  loading?: boolean;
}) {
  const isOk = status === "ok";

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-text-primary text-sm">{title}</h4>
        {loading ? (
          <div className="skeleton h-5 w-20 rounded" />
        ) : (
          <Badge variant={isOk ? "success" : "destructive"}>
            {isOk ? "Active (OK)" : "Degraded"}
          </Badge>
        )}
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
      <div className="pt-2 border-t border-border-subtle text-[11px] text-text-tertiary font-mono">
        Vendor ID: <span className="text-text-secondary">{vendor}</span>
      </div>
    </Card>
  );
}
