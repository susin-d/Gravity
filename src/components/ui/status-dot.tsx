import { cn } from "../../lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "neutral";

const tones: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink-dim",
};

export interface StatusDotProps {
  tone: StatusTone;
  pulse?: boolean;
  label: string;
}

export function StatusDot({ tone, pulse = false, label }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          tones[tone],
          pulse && "animate-pulse",
        )}
      />
      <span>{label}</span>
    </span>
  );
}
