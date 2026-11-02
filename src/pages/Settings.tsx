import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SettingsSection as SettingsSectionId } from "../components/layout/panels/SettingsPanel";

interface AppSettings {
  db_path: string;
  app_data_dir: string;
  flags: {
    auto_switch: boolean;
  };
}

interface SettingsProps {
  selectedSection?: SettingsSectionId;
}

export default function Settings({ selectedSection }: SettingsProps = {}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [wtAvailable, setWtAvailable] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      invoke<AppSettings>("get_settings"),
      invoke<boolean>("check_terminal_available"),
      invoke<string>("get_version"),
    ])
      .then(([s, wt, v]) => {
        setSettings(s);
        setWtAvailable(wt);
        setVersion(v);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Settings</h2>
        <p className="text-xs text-ink-low mt-0.5">
          Application data paths, terminal fallback, and feature flag status.
        </p>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {settings ? (
        <div className="space-y-4">
          <SettingsSection
            title="Data"
            selected={selectedSection === "database"}
          >
            <InfoRow label="App data" value={settings.app_data_dir} />
            <InfoRow label="Database" value={settings.db_path} />
          </SettingsSection>

          <SettingsSection
            title="Terminal Fallback"
            selected={selectedSection === "terminal"}
          >
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-white">Windows Terminal</p>
                <p className="text-xs text-ink-low mt-0.5">
                  Sessions use the terminal selected per project. Projects set to
                  Auto use Windows Terminal when available, otherwise PowerShell.
                </p>
              </div>
              <span className={wtAvailable ? "badge-success" : "badge-neutral"}>
                {wtAvailable === null ? "checking" : wtAvailable ? "detected" : "not found"}
              </span>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Feature Flags"
            selected={selectedSection === "flags"}
          >
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-white">Auto-switch</p>
                <p className="text-xs text-ink-low mt-0.5">
                  Automated profile switching on rate-limit hit. Edit{" "}
                  <code className="font-mono text-ink-mid">flags.toml</code> to change.
                </p>
              </div>
              <span className={settings.flags.auto_switch ? "badge-success" : "badge-neutral"}>
                {settings.flags.auto_switch ? "enabled" : "disabled"}
              </span>
            </div>
          </SettingsSection>

          <SettingsSection title="About Gravity" selected={selectedSection === "about"}>
            <InfoRow label="Version" value={version || "unknown"} />
            <InfoRow label="Runtime" value="Tauri 2 · Win32 Job Objects · SQLite WAL" />
            <InfoRow label="Isolation" value="Per-profile config dirs with sanitized environment" />
          </SettingsSection>
        </div>
      ) : (
        !error && (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-4 w-64 rounded" />
              <div className="skeleton h-4 w-48 rounded" />
            </div>
          </div>
        )
      )}
    </div>
  );
}

function SettingsSection({
  title,
  selected,
  children,
}: {
  title: string;
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`card p-4 transition-all ${
        selected ? "border-white/40 shadow-glow bg-[#181818]" : ""
      }`}
    >
      <h3 className="section-heading mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-1">
      <span className="text-xs text-ink-low min-w-[80px] flex-shrink-0">{label}</span>
      <code className="text-xs text-ink-mid break-all font-mono leading-relaxed">{value}</code>
    </div>
  );
}
