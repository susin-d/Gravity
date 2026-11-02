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
      <h2 className="text-xl font-bold mb-6">Settings</h2>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {settings ? (
        <div className="space-y-6">
          {/* Data location */}
          <Section title="Data">
            <InfoRow label="App data" value={settings.app_data_dir} />
            <InfoRow label="Database" value={settings.db_path} />
          </Section>

          {/* Feature flags */}
          <Section title="Feature Flags">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-300">
                  Auto-switch
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automatically switch to a non-limited profile when a rate
                  limit is hit. Edit{" "}
                  <code className="text-gray-400">flags.toml</code> to change.
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono ${
                  settings.flags.auto_switch
                    ? "bg-green-900/50 text-green-400"
                    : "bg-gray-800 text-gray-500"
                }`}
              >
                {settings.flags.auto_switch ? "enabled" : "disabled"}
              </span>
            </div>
          </Section>
        </div>
      ) : (
        !error && (
          <p className="text-sm text-gray-500 animate-pulse">
            Loading settings…
          </p>
        )
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-1">
      <span className="text-sm text-gray-500 min-w-[80px]">{label}</span>
      <code className="text-sm text-gray-300 break-all font-mono">
        {value}
      </code>
    </div>
  );
}
