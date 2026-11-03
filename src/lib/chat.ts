import type { ChatMessageMeta, ChatUsage, Vendor } from "./types";

export interface PermissionModeOption {
  value: string;
  label: string;
  description: string;
}

export const permissionModes: Record<Vendor, PermissionModeOption[]> = {
  claude: [
    {
      value: "plan",
      label: "Plan",
      description: "Read-only. Claude proposes changes but cannot apply them.",
    },
    {
      value: "acceptEdits",
      label: "Accept edits",
      description: "Claude can edit files in the working directory.",
    },
    {
      value: "bypassPermissions",
      label: "Bypass permissions",
      description: "Claude can run any tool without asking. Use with care.",
    },
  ],
  codex: [
    {
      value: "read-only",
      label: "Read only",
      description: "Codex can inspect files but cannot write or run commands.",
    },
    {
      value: "workspace-write",
      label: "Workspace write",
      description: "Codex can edit files inside the workspace.",
    },
    {
      value: "danger-full-access",
      label: "Full access",
      description: "Codex can write anywhere and run commands without sandboxing.",
    },
  ],
};

export function defaultPermissionMode(vendor: Vendor): string {
  return permissionModes[vendor][0].value;
}

export function permissionModeLabel(vendor: Vendor, mode: string): string {
  const options = permissionModes[vendor];
  return options.find((option) => option.value === mode)?.label ?? mode;
}

function isUsage(value: unknown): value is ChatUsage {
  if (typeof value !== "object" || value === null) return false;
  return ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "cost_usd"].every(
    (key) => {
      const field = (value as Record<string, unknown>)[key];
      return field === null || typeof field === "number";
    },
  );
}

export function parseChatMeta(meta: string | null): ChatMessageMeta | null {
  if (!meta) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(meta);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  if (typeof record.profile_id !== "string") return null;

  const tools = Array.isArray(record.tools)
    ? record.tools.flatMap((tool) => {
        if (typeof tool !== "object" || tool === null) return [];
        const candidate = tool as Record<string, unknown>;
        if (typeof candidate.name !== "string" || typeof candidate.summary !== "string") {
          return [];
        }
        return [{ name: candidate.name, summary: candidate.summary }];
      })
    : [];

  return {
    profile_id: record.profile_id,
    usage: isUsage(record.usage) ? record.usage : null,
    tools,
  };
}

export function formatTokens(usage: ChatUsage): string | null {
  const parts: string[] = [];
  if (usage.input_tokens !== null) parts.push(`${usage.input_tokens.toLocaleString()} in`);
  if (usage.output_tokens !== null) parts.push(`${usage.output_tokens.toLocaleString()} out`);
  if (usage.cost_usd !== null) parts.push(`$${usage.cost_usd.toFixed(4)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
