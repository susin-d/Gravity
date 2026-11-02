import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Clock, AlertCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

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
      <div
        className="border border-edge-subtle rounded-lg p-3 text-xs flex items-center justify-between backdrop-blur-2xl"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-center gap-2">
          <Badge variant="neutral">Unknown</Badge>
          <span className="text-ink-low italic">No telemetry recorded</span>
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-6 px-2 text-[11px] text-ink-low hover:text-white"
          >
            {refreshing ? "Checking…" : "Check"}
          </Button>
        )}
      </div>
    );
  }

  const { source, value_used, value_limit, unit, reset_at, window: win } = reading;

  // Source badges
  const badgeVariant = {
    official:  "success"  as const,
    estimated: "warning"  as const,
    unknown:   "neutral"  as const,
  }[source];

  const sourceLabel = {
    official:  "Official",
    estimated: "Estimated",
    unknown:   "Unknown",
  }[source];

  // Calculate percentage only if both are non-null and limit > 0
  const hasValues =
    typeof value_used === "number" &&
    typeof value_limit === "number" &&
    value_limit > 0;
  const percent = hasValues
    ? Math.min(100, Math.round(((value_used as number) / (value_limit as number)) * 100))
    : null;

  return (
    <div
      className="border border-edge-subtle rounded-lg p-3 space-y-2 backdrop-blur-2xl"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant}>{sourceLabel}</Badge>
          {win && <span className="text-[10px] text-ink-low capitalize">{win}</span>}
        </div>

        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-6 px-2 text-[11px] text-ink-low hover:text-white flex items-center gap-1"
            title="Refresh usage telemetry"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </Button>
        )}
      </div>

      {/* Tri-state content */}
      {source === "unknown" ? (
        // PRIME DIRECTIVE #3 & AC-08: No fake progress bars, no fake numbers, no 0%
        <div className="py-1">
          <div className="flex items-center gap-1.5 text-xs text-ink-mid font-medium">
            <AlertCircle className="h-3.5 w-3.5 text-ink-low" />
            <span>Check manually</span>
          </div>
          <p className="text-[11px] text-ink-low mt-0.5">
            {reading.detail || "Provider usage cannot be verified automatically."}
          </p>
        </div>
      ) : (
        // Official or Estimated values
        <div>
          <div className="flex items-baseline justify-between text-xs mb-1.5 font-mono">
            <span className="text-ink-mid">
              {formatValue(value_used)} / {formatValue(value_limit)} {unit || "units"}
            </span>
            {percent !== null && (
              <span className={`font-semibold ${percent > 85 ? "text-red-400" : "text-white"}`}>
                {percent}%
              </span>
            )}
          </div>

          {/* Progress bar only rendered when exact numbers exist and source != unknown */}
          {percent !== null && (
            <div
              className="w-full rounded-full h-1.5 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={`h-full ${
                  percent > 85 ? "bg-red-500" : percent > 60 ? "bg-amber-500" : "bg-emerald-500"
                }`}
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
      const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs  = Math.floor((diff % (1000 * 60)) / 1000);

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
    <div className="text-[11px] text-ink-low flex items-center gap-1.5 font-mono pt-1.5 border-t border-edge-subtle">
      <Clock className="h-3 w-3" />
      <span>{remainingText}</span>
    </div>
  );
}
