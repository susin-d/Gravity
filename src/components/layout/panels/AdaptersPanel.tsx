import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

interface AdaptersHealthReport {
  claude: "ok" | "degraded";
  codex: "ok" | "degraded";
}

interface AdaptersPanelProps {
  selectedAdapter: "claude" | "codex" | null;
  onSelectAdapter: (adapter: "claude" | "codex") => void;
}

export default function AdaptersPanel({
  selectedAdapter,
  onSelectAdapter,
}: AdaptersPanelProps) {
  const [report, setReport] = useState<AdaptersHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = async () => {
    try {
      setLoading(true);
      const res = await invoke<AdaptersHealthReport>("check_adapters_health");
      setReport(res);
      setError(null);
    } catch (err) {
      setReport(null);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const statusLabel = (vendor: "claude" | "codex") => {
    if (error) return "unavailable";
    if (!report) return "checking";
    return report[vendor] === "ok" ? "healthy" : "degraded";
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-subtle px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-white" />
          <span className="text-xs font-semibold text-white">CLI Adapters</span>
        </div>
        <button
          type="button"
          onClick={loadHealth}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-edge-subtle bg-glass-2 text-ink-high hover:border-edge-DEFAULT hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Adapters List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* Claude Code Adapter */}
        <button
          type="button"
          onClick={() => onSelectAdapter("claude")}
          className={`flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-all ${
            selectedAdapter === "claude"
              ? "bg-[#181818] border border-edge-DEFAULT text-white shadow-md"
              : "text-ink-mid hover:bg-glass-2 hover:text-white border border-transparent"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-xs font-medium">Claude Code</span>
            </div>
            {statusLabel("claude") === "healthy" ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <CheckCircle2 className="h-3 w-3" />
                healthy
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                <AlertTriangle className="h-3 w-3" />
                {statusLabel("claude")}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10px] text-ink-low font-mono">
            CLI detector & parser
          </span>
        </button>

        {/* OpenAI Codex Adapter */}
        <button
          type="button"
          onClick={() => onSelectAdapter("codex")}
          className={`flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-all ${
            selectedAdapter === "codex"
              ? "bg-[#181818] border border-edge-DEFAULT text-white shadow-md"
              : "text-ink-mid hover:bg-glass-2 hover:text-white border border-transparent"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-medium">OpenAI Codex</span>
            </div>
            {statusLabel("codex") === "healthy" ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <CheckCircle2 className="h-3 w-3" />
                healthy
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                <AlertTriangle className="h-3 w-3" />
                {statusLabel("codex")}
              </span>
            )}
          </div>
          <span className="mt-1 text-[10px] text-ink-low font-mono">
            CLI detector & parser
          </span>
        </button>
      </div>

      {error && (
        <div className="mx-2 mt-2 rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-2 text-[10px] text-rose-300">
          {error}
        </div>
      )}

      <div className="border-t border-edge-subtle px-3 py-2 text-[10px] text-ink-low font-mono flex justify-between">
        <span>2 Adapters</span>
        <span>Local probe</span>
      </div>
    </div>
  );
}
