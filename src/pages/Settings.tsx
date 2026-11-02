import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppSettings {
  db_path: string;
  app_data_dir: string;
  flags: {
    auto_switch: boolean;
  };
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppSettings>("get_settings")
      .then(setSettings)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
        <p className="text-xs text-text-tertiary mt-0.5">
          Application data paths and feature flag status.
        </p>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-800/60 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {settings ? (
        <div className="space-y-4">
          {/* Data paths */}
          <SettingsSection title="Data">
            <InfoRow label="App data" value={settings.app_data_dir} />
            <InfoRow label="Database" value={settings.db_path} />
          </SettingsSection>

          {/* Feature flags */}
          <SettingsSection title="Feature Flags">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-text-primary">Auto-switch</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Automated profile switching on rate-limit hit. Edit{" "}
                  <code className="font-mono text-text-secondary">flags.toml</code> to change.
                </p>
              </div>
              <span className={settings.flags.auto_switch ? "badge-success" : "badge-neutral"}>
                {settings.flags.auto_switch ? "enabled" : "disabled"}
              </span>
            </div>
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

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="section-heading mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-1">
      <span className="text-xs text-text-tertiary min-w-[80px] flex-shrink-0">{label}</span>
      <code className="text-xs text-text-secondary break-all font-mono leading-relaxed">{value}</code>
    </div>
  );
}
