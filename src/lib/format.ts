import type {
  SessionStatus,
  SwitchOutcome,
  SwitchReason,
  Tag,
  TerminalKind,
  Vendor,
} from "./types";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatRelative(value: string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);

  if (abs < 60_000) return relative.format(Math.round(diffMs / 1000), "second");
  if (abs < 3_600_000) return relative.format(Math.round(diffMs / 60_000), "minute");
  if (abs < 86_400_000) return relative.format(Math.round(diffMs / 3_600_000), "hour");
  return relative.format(Math.round(diffMs / 86_400_000), "day");
}

export function formatDuration(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = toDate(start);
  if (!from) return "—";
  const to = toDate(end) ?? new Date();
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function shortId(value: string | null | undefined): string {
  if (!value) return "—";
  return `${value.slice(0, 8)}…`;
}

export function vendorLabel(vendor: Vendor): string {
  return vendor === "claude" ? "Claude Code" : "OpenAI Codex";
}

export function tagLabel(tag: Tag): string {
  switch (tag) {
    case "personal":
      return "Personal";
    case "work":
      return "Work";
    case "client":
      return "Client";
  }
}

export function terminalLabel(terminal: TerminalKind): string {
  switch (terminal) {
    case "auto":
      return "Auto";
    case "wt":
      return "Windows Terminal";
    case "powershell":
      return "PowerShell";
  }
}

export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "ended":
      return "Ended";
    case "crashed":
      return "Crashed";
    case "killed":
      return "Stopped";
  }
}

export function reasonLabel(reason: SwitchReason): string {
  switch (reason) {
    case "manual":
      return "Manual switch";
    case "limit":
      return "Rate limit switch";
    case "auto":
      return "Auto-switch";
  }
}

export function outcomeLabel(outcome: SwitchOutcome): string {
  switch (outcome) {
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "confirmed_client_boundary":
      return "Client boundary confirmed";
    case "blocked_client_auto":
      return "Blocked by client boundary";
    case "no_eligible":
      return "No eligible profile";
  }
}
