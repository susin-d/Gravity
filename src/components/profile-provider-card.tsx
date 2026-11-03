import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Sparkles, SquareTerminal, type LucideIcon } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { CliToolingStatus, Vendor } from "../lib/types";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const providerIcons: Record<Vendor, LucideIcon> = {
  claude: Sparkles,
  codex: SquareTerminal,
};

export interface ProviderCardProps {
  vendor: Vendor;
  name: string;
  tagline: string;
  packageName: string;
  selected: boolean;
  onSelect: (vendor: Vendor) => void;
}

export function ProviderCard({
  vendor,
  name,
  tagline,
  packageName,
  selected,
  onSelect,
}: ProviderCardProps) {
  const [probe, setProbe] = useState<CliToolingStatus | null>(null);
  const [probing, setProbing] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installStarted, setInstallStarted] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const reprobe = useCallback(async () => {
    setProbing(true);
    setInstallError(null);
    try {
      setProbe(await api.probeProviderCli(vendor));
    } catch {
      setProbe(null);
    } finally {
      setProbing(false);
    }
  }, [vendor]);

  useEffect(() => {
    void reprobe();
  }, [reprobe]);

  async function install() {
    setInstalling(true);
    setInstallError(null);
    try {
      await api.spawnProviderInstall(vendor);
      setInstallStarted(true);
    } catch (cause) {
      setInstallError(errorMessage(cause));
    } finally {
      setInstalling(false);
    }
  }

  const Icon = providerIcons[vendor];
  const installed = probe?.installed === true;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border transition-colors",
        selected
          ? "border-ink/50 bg-raised"
          : "border-line bg-panel hover:border-line-strong",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(vendor)}
        aria-pressed={selected}
        className="flex w-full items-start gap-3 px-3 pb-3 pt-3.5 text-left transition-colors hover:bg-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/40"
      >
        <span className="rounded-md border border-line bg-canvas p-2 text-ink-muted">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-tight text-ink">{name}</span>
          <span className="mt-1 block text-[11px] leading-snug text-ink-dim">{tagline}</span>
        </span>
        {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden /> : null}
      </button>

      <div className="mt-auto border-t border-line px-3 py-2.5">
        {probing && !probe ? (
          <span className="flex items-center gap-2 text-xs text-ink-dim">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Checking installation…
          </span>
        ) : probe === null ? (
          <span className="flex flex-wrap items-center gap-2 text-xs text-warning-text">
            Could not check this CLI.
            <Button variant="ghost" size="sm" onClick={() => void reprobe()}>
              Retry
            </Button>
          </span>
        ) : installed ? (
          <span className="flex flex-wrap items-center gap-2" title={probe.path ?? undefined}>
            <Badge variant="success">Installed</Badge>
            <span className="text-[11px] text-ink-muted">
              {probe.version ? `${probe.cli} ${probe.version}` : "Version unknown"}
            </span>
          </span>
        ) : (
          <span className="space-y-2">
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">Not installed</Badge>
              {!installStarted ? (
                <code className="font-mono text-[11px] text-ink-dim">
                  npm i -g {packageName}
                </code>
              ) : null}
            </span>

            {probe.npm_available ? (
              installStarted ? (
                <span className="block space-y-1.5">
                  <span className="block text-[11px] text-ink-muted">
                    A console window was opened. Close it once the install finishes, then:
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void reprobe()}
                    loading={probing}
                  >
                    Check again
                  </Button>
                </span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void install()} loading={installing}>
                  Install
                </Button>
              )
            ) : (
              <span className="block text-[11px] leading-snug text-ink-dim">
                Gravity installs through npm. Install Node.js from nodejs.org, then check again.{" "}
                <button
                  type="button"
                  onClick={() => void reprobe()}
                  className="text-info-text underline underline-offset-2 hover:text-ink"
                >
                  Check again
                </button>
              </span>
            )}

            {installError ? (
              <span role="alert" className="block text-[11px] text-danger-text">
                {installError}
              </span>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
}
