import { Loader2, RefreshCw } from "lucide-react";
import type { UsageReading, UsageSource } from "../../lib/types";
import { formatRelative } from "../../lib/format";
import { Badge, type BadgeVariant } from "./badge";
import { Button } from "./button";
import { cn } from "../../lib/utils";

const sourceLabels: Record<UsageSource, string> = {
  official: "Official",
  estimated: "Estimated",
  unknown: "Unknown",
};

const sourceVariants: Record<UsageSource, BadgeVariant> = {
  official: "success",
  estimated: "warning",
  unknown: "neutral",
};

const barTones: Record<UsageSource, string> = {
  official: "bg-success",
  estimated: "bg-warning",
  unknown: "bg-ink-dim",
};

export interface UsageBadgeProps {
  reading?: UsageReading | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  compact?: boolean;
}

export function UsageBadge({
  reading,
  onRefresh,
  refreshing = false,
  compact = false,
}: UsageBadgeProps) {
  const source: UsageSource = reading?.source ?? "unknown";
  const hasValues =
    reading != null &&
    reading.value_used != null &&
    reading.value_limit != null &&
    reading.value_limit > 0;

  const percent = hasValues
    ? Math.min(
        100,
        Math.max(0, ((reading.value_used ?? 0) / (reading.value_limit ?? 1)) * 100),
      )
    : null;

  const refreshButton = onRefresh ? (
    <Button
      variant="ghost"
      size="icon"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label="Refresh usage reading"
      title="Refresh usage reading"
      className="h-7 w-7"
    >
      {refreshing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      )}
    </Button>
  ) : null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant={sourceVariants[source]}>{sourceLabels[source]}</Badge>
        <span className="text-xs text-ink-muted">
          {hasValues
            ? `${reading?.value_used} / ${reading?.value_limit} ${reading?.unit ?? ""}`
            : "Check manually"}
        </span>
        {refreshButton}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-raised/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={sourceVariants[source]}>{sourceLabels[source]}</Badge>
          {reading?.window && (
            <span className="text-xs text-ink-dim">{reading.window}</span>
          )}
        </div>
        {refreshButton}
      </div>

      {hasValues ? (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-mono">
              {reading?.value_used} / {reading?.value_limit} {reading?.unit ?? ""}
            </span>
            <span>{percent?.toFixed(0)}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Usage consumed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
          >
            <div
              className={cn("h-full rounded-full", barTones[source])}
              style={{ width: `${percent ?? 0}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          {reading?.detail ??
            "No verified reading. Gravity cannot read provider usage automatically."}
        </p>
      )}

      {hasValues && reading?.detail && (
        <p className="mt-2 text-xs text-ink-muted">{reading.detail}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-ink-dim">
        <span>
          {reading
            ? `Checked ${formatRelative(reading.fetched_at)}`
            : "Not checked yet"}
        </span>
        {reading?.reset_at && <span>Resets {formatRelative(reading.reset_at)}</span>}
      </div>
    </div>
  );
}
