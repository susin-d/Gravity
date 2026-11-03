import type { HTMLAttributes } from "react";
import type { Tag, Vendor } from "../../lib/types";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "neutral"
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "claude"
  | "codex"
  | "tag-personal"
  | "tag-work"
  | "tag-client";

const variants: Record<BadgeVariant, string> = {
  neutral: "border-line bg-raised text-ink-muted",
  default: "border-line-strong bg-hover text-ink",
  success: "border-success-border bg-success-bg text-success-text",
  warning: "border-warning-border bg-warning-bg text-warning-text",
  danger: "border-danger-border bg-danger-bg text-danger-text",
  info: "border-info-border bg-info-bg text-info-text",
  claude: "border-claude-border bg-claude-bg text-claude-text",
  codex: "border-codex-border bg-codex-bg text-codex-text",
  "tag-personal": "border-line bg-raised text-ink-muted",
  "tag-work": "border-info-border bg-info-bg text-info-text",
  "tag-client": "border-danger-border bg-danger-bg text-danger-text",
};

export function tagBadgeVariant(tag: Tag): BadgeVariant {
  switch (tag) {
    case "personal":
      return "tag-personal";
    case "work":
      return "tag-work";
    case "client":
      return "tag-client";
  }
}

export function vendorBadgeVariant(vendor: Vendor): BadgeVariant {
  return vendor === "claude" ? "claude" : "codex";
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
