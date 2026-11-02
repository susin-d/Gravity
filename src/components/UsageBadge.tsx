import { useState, useEffect } from "react";

export interface UsageReading {
  id: string;
  profile_id: string;
  source: "official" | "estimated" | "unknown";
  window?: string;
  value_used?: number;
  value_limit?: number;
  unit?: string;
  reset_at?: string; // ISO 8601
  fetched_at: string;
  detail?: string;
}

interface UsageBadgeProps {
  reading?: UsageReading | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function UsageBadge({ reading, onRefresh, refreshing }: UsageBadgeProps) {
  if (!reading) {
    return (
      <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-500">
            Unknown
          </span>
          <span className="text-gray-500 italic">No usage data recorded</span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-[11px] text-gray-400 hover:text-gray-200 disabled:opacity-50"
          >
            {refreshing ? "Checking…" : "Check"}
          </button>
        )}
      </div>
    );
  }

  const { source, value_used, value_limit, unit, reset_at, window: win } = reading;

  // Source badges
  const sourceConfig = {
    official: {
      label: "Official",
      className: "bg-emerald-950/60 text-emerald-400 border border-emerald-800/80",
    },
    estimated: {
      label: "Estimated",
      className: "bg-amber-950/60 text-amber-400 border border-amber-800/80",
    },
    unknown: {
      label: "Unknown",
      className: "bg-gray-800/70 text-gray-400 border border-gray-700",
    },
  }[source];

  // Calculate percentage only if both are non-null and limit > 0
  const hasValues = typeof value_used === "number" && typeof value_limit === "number" && value_limit > 0;
  const percent = hasValues ? Math.min(100, Math.round(((value_used as number) / (value_limit as number)) * 100)) : null;

  return (
    <div className="bg-gray-950/70 border border-gray-800/90 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${sourceConfig.className}`}>
            {sourceConfig.label}
          </span>
          {win && <span className="text-[10px] text-gray-500 capitalize">{win}</span>}
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-[11px] text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
            title="Refresh usage telemetry"
          >
            {refreshing ? "Refreshing…" : "🔄 Refresh"}
          </button>
        )}
      </div>

      {/* Tri-state content */}
      {source === "unknown" ? (
        // PRIME DIRECTIVE #3 & AC-08: No fake progress bars, no fake numbers, no 0%
        <div className="py-1">
          <p className="text-xs text-gray-400 font-medium">Check manually</p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            {reading.detail || "Provider usage cannot be verified automatically."}
          </p>
        </div>
      ) : (
        // Official or Estimated values
        <div>
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="font-mono text-gray-300">
              {formatValue(value_used)} / {formatValue(value_limit)} {unit || "units"}
            </span>
            {percent !== null && (
              <span className={`font-mono font-semibold ${percent > 85 ? "text-red-400" : "text-gray-400"}`}>
                {percent}%
              </span>
            )}
          </div>

          {/* Progress bar only rendered when exact numbers exist and source != unknown */}
          {percent !== null && (
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  percent > 85 ? "bg-red-500" : percent > 60 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Reset Timer: STRICT RULE AC-09: Render ONLY if reset_at is explicitly present */}
      {reset_at && <ResetTimer resetAt={reset_at} />}
    </div>
  );
}

function formatValue(v?: number): string {
  if (v === undefined || v === null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v * 100) / 100);
}

function ResetTimer({ resetAt }: { resetAt: string }) {
  const [remainingText, setRemainingText] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(resetAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemainingText("Reset ready");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setRemainingText(`Resets in ${hours}h ${mins}m`);
      } else if (mins > 0) {
        setRemainingText(`Resets in ${mins}m ${secs}s`);
      } else {
        setRemainingText(`Resets in ${secs}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetAt]);

  return (
    <div className="text-[11px] text-gray-500 flex items-center gap-1 font-mono pt-1 border-t border-gray-800/60">
      <span>⏱️</span>
      <span>{remainingText}</span>
    </div>
  );
}
