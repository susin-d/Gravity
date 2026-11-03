import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ClipboardCopy, RefreshCw } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { AdapterHealth, AdaptersHealthReport } from "../lib/types";
import { useAppData } from "../state/AppData";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/layout/page-header";
import { StatusDot } from "../components/ui/status-dot";
import { useToast } from "../components/ui/toast";

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
        </div>
        {actions}
      </div>
      <div className="divide-y divide-line/70">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <div className="min-w-0 max-w-full text-right text-sm text-ink">{children}</div>
    </div>
  );
}

function PathRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-xs font-medium text-ink-muted">{label}</span>
      <div className="flex min-w-0 items-start gap-1">
        <code className="break-all text-left font-mono text-[11px] leading-5 text-ink-muted">
          {value}
        </code>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCopy(value)}
          aria-label={`Copy ${label}`}
          title="Copy path"
        >
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function HealthRow({ name, health }: { name: string; health: AdapterHealth }) {
  const ok = health.status === "ok";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-ink">
        <StatusDot
          tone={ok ? "success" : "danger"}
          label={name}
        />
        <Badge variant={ok ? "success" : "danger"}>{ok ? "Ready" : "Unavailable"}</Badge>
      </div>
      <p className="max-w-[60%] break-all text-right font-mono text-[11px] text-ink-dim">
        {health.detail}
      </p>
    </div>
  );
}

export function SettingsPage() {
  const { settings, terminalAvailable, sessions, profiles } = useAppData();
  const { toast } = useToast();

  const [version, setVersion] = useState<string | null>(null);
  const [health, setHealth] = useState<AdaptersHealthReport | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const report = await api.checkAdaptersHealth();
      setHealth(report);
      setHealthError(null);
    } catch (cause) {
      setHealthError(errorMessage(cause));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void api
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
    void loadHealth();
  }, [loadHealth]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ variant: "success", title: `${label} copied` });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not copy",
        description: errorMessage(cause),
      });
    }
  }

  const autoSwitch = settings?.flags.auto_switch === true;
  const runningCount = sessions.filter((session) => session.status === "running").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Storage, feature flags, and real diagnostics for the local Gravity runtime."
      />

      <Section
        title="Runtime"
        description="Local paths used by this installation. Nothing is synced to a server."
      >
        <Row label="Version">
          <span className="font-mono text-xs text-ink-muted">
            {version ? `v${version}` : "—"}
          </span>
        </Row>
        {settings ? (
          <>
            <PathRow label="Database" value={settings.db_path} onCopy={(v) => void copy(v, "Database path")} />
            <PathRow label="App data" value={settings.app_data_dir} onCopy={(v) => void copy(v, "App data path")} />
            <PathRow label="Flags file" value={settings.flags_path} onCopy={(v) => void copy(v, "Flags path")} />
          </>
        ) : (
          <Row label="Storage">
            <span className="text-xs text-ink-dim">Settings unavailable</span>
          </Row>
        )}
      </Section>

      <Section
        title="Feature flags"
        description="Flags are read once from flags.toml at startup. Restart Gravity after editing the file."
      >
        <Row label="Auto-switch">
          <div className="flex items-center justify-end gap-2">
            <Badge variant={autoSwitch ? "success" : "neutral"}>
              {autoSwitch ? "Enabled" : "Disabled"}
            </Badge>
            <span className="text-xs text-ink-muted">
              {autoSwitch
                ? "Eligible projects may switch after a reported rate limit."
                : "No auto-switch path is exposed."}
            </span>
          </div>
        </Row>
        <Row label="Client lockout">
          <span className="text-xs text-ink-muted">
            Client profiles and client projects are never auto-switched, even when the
            flag is on.
          </span>
        </Row>
        <Row label="Terminal">
          <div className="flex items-center justify-end gap-2">
            <Badge
              variant={
                terminalAvailable == null
                  ? "neutral"
                  : terminalAvailable
                    ? "success"
                    : "warning"
              }
            >
              {terminalAvailable === false
                ? "PowerShell only"
                : terminalAvailable
                  ? "Windows Terminal"
                  : "Checking…"}
            </Badge>
          </div>
        </Row>
      </Section>

      <Section
        title="Diagnostics"
        description="Probes the actual CLI executables on PATH. No status is assumed."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadHealth()}
            loading={healthLoading}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Probe again
          </Button>
        }
      >
        {healthError ? (
          <Row label="Adapters">
            <span role="alert" className="text-xs text-danger-text">
              {healthError}
            </span>
          </Row>
        ) : health ? (
          <>
            <HealthRow name="Claude Code" health={health.claude} />
            <HealthRow name="OpenAI Codex" health={health.codex} />
          </>
        ) : (
          <Row label="Adapters">
            <span className="text-xs text-ink-dim">Probing…</span>
          </Row>
        )}
        <Row label="Sessions">
          <span className="text-xs text-ink-muted">
            {runningCount} running · {sessions.length} recorded · {profiles.length} profiles
          </span>
        </Row>
      </Section>

      <Section
        title="Data and safety"
        description="How Gravity handles credentials, usage numbers, and child processes."
      >
        <Row label="Credentials">
          <span className="text-xs text-ink-muted">
            Stored in Windows Credential Manager under gravity:&lt;profile-id&gt;. Secrets
            are never shown again after saving.
          </span>
        </Row>
        <Row label="Usage readings">
          <span className="text-xs text-ink-muted">
            Readings are official, estimated, or unknown. Gravity does not invent
            percentages, session counts, or reset times.
          </span>
        </Row>
        <Row label="Process isolation">
          <span className="text-xs text-ink-muted">
            Every session runs in a Win32 Job Object with kill-on-close. Closing Gravity
            terminates its child CLIs.
          </span>
        </Row>
        <Row label="WSL">
          <span className="text-xs text-ink-muted">Planned. Not available in this build.</span>
        </Row>
      </Section>

      <Section
        title="Keyboard"
        description="Navigation works without the mouse."
      >
        <Row label="Go to page">
          <span className="text-xs text-ink-muted">
            Ctrl+1 Launch · Ctrl+2 Profiles · Ctrl+3 Projects · Ctrl+4 Activity · Ctrl+5
            Settings
          </span>
        </Row>
      </Section>
    </div>
  );
}
