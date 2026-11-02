import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Profile {
  id: string;
  label: string;
  vendor: "claude" | "codex";
  tag: "personal" | "work" | "client";
  created_at: string;
}

interface AppSettings {
  db_path: string;
  app_data_dir: string;
  flags: {
    auto_switch: boolean;
  };
}

interface SwitchEvent {
  id: string;
  session_id?: string;
  from_profile_id: string;
  to_profile_id: string;
  project_id?: string;
  reason: string;
  outcome: string;
  switched_at: string;
  error_detail?: string;
}

export default function AutoSwitchConsent() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [excludedProfileIds, setExcludedProfileIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pList, sData] = await Promise.all([
        invoke<Profile[]>("list_profiles"),
        invoke<AppSettings>("get_settings"),
      ]);
      setProfiles(pList);
      setSettings(sData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleExcludeProfile = (id: string) => {
    setExcludedProfileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleTestAutoSwitch = async () => {
    try {
      setTestResult("Simulating engine evaluation on mock test session...");
      const result = await invoke<SwitchEvent | null>("trigger_auto_switch", {
        sessionId: "mock-session-test",
      });
      setTestResult(result ? JSON.stringify(result, null, 2) : "No switch occurred (guards active or session not found)");
    } catch (err) {
      setTestResult(`Engine Guard Response: ${err}`);
    }
  };

  const isAutoSwitchActive = settings?.flags?.auto_switch ?? false;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <span>⚡</span> Auto-Switch Consent & Allowlist
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Automated session rate-limit recovery policy engine (Milestone M6)
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-mono font-medium border ${
            isAutoSwitchActive
              ? "bg-green-950/60 text-green-400 border-green-800"
              : "bg-gray-800 text-gray-400 border-gray-700"
          }`}
        >
          {isAutoSwitchActive ? "Engine Armed (Flag Active)" : "Engine Gated (Flag Disabled)"}
        </span>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Flag Gate Status Card */}
      {!isAutoSwitchActive && (
        <div className="bg-amber-950/20 border border-amber-800/60 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <span>⚠️</span> Master Feature Flag Is Inactive
          </div>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            Per <strong>Prime Directive #4</strong> and <strong>Acceptance Criterion AC-10</strong>, the auto-switch policy engine is strictly gated.
            To enable this engine, edit <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono">flags.toml</code> in{" "}
            <code className="text-gray-400">{settings?.app_data_dir || "%APPDATA%\\Gravity"}</code> and set:
          </p>
          <pre className="bg-black/50 p-2.5 rounded text-xs font-mono text-gray-300">auto_switch = true</pre>
        </div>
      )}

      {/* Prime Directive Policy Shield Banner */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <span>🛡️</span> Security & Boundary Isolation Rules
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-950 border border-gray-800/80 rounded-lg p-3 space-y-1">
            <span className="font-semibold text-gray-200">Session Boundary Only</span>
            <p className="text-gray-500 leading-relaxed">
              Switches only take place when an active CLI session halts on a 429/quota exhaustion error.
            </p>
          </div>
          <div className="bg-gray-950 border border-gray-800/80 rounded-lg p-3 space-y-1">
            <span className="font-semibold text-amber-400">Client Account Lockout</span>
            <p className="text-gray-500 leading-relaxed">
              Profiles or projects tagged <code className="text-amber-300">client</code> are strictly immutable and never auto-switched.
            </p>
          </div>
          <div className="bg-gray-950 border border-gray-800/80 rounded-lg p-3 space-y-1">
            <span className="font-semibold text-blue-400">Audit Guaranteed</span>
            <p className="text-gray-500 leading-relaxed">
              Every switch attempt logs exactly one immutable record into SQLite table <code className="text-blue-300">switch_events</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Allowlist & Profile Eligibility Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">Profile Auto-Switch Allowlist</h3>
          <span className="text-xs text-gray-500">
            {profiles.filter((p) => p.tag !== "client").length} eligible profiles
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading profiles…</div>
        ) : profiles.length === 0 ? (
          <div className="p-8 text-center bg-gray-900 rounded-xl border border-gray-800 text-gray-500 text-sm">
            No profiles registered. Create profiles in the Profiles tab first.
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-950 border-b border-gray-800 text-gray-400 uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Profile</th>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4">Tag</th>
                  <th className="py-3 px-4">Eligibility Status</th>
                  <th className="py-3 px-4 text-right">Allowlist State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {profiles.map((p) => {
                  const isClient = p.tag === "client";
                  const isExcluded = excludedProfileIds.has(p.id);

                  return (
                    <tr key={p.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-200">
                        {p.label}
                      </td>
                      <td className="py-3 px-4 text-gray-400 font-mono capitalize">
                        {p.vendor}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            isClient
                              ? "bg-amber-950/60 text-amber-300 border-amber-800"
                              : p.tag === "work"
                                ? "bg-purple-950/60 text-purple-300 border-purple-800"
                                : "bg-blue-950/60 text-blue-300 border-blue-800"
                          }`}
                        >
                          {p.tag}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isClient ? (
                          <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                            <span>🚫</span> Excluded by Client Boundary
                          </span>
                        ) : isExcluded ? (
                          <span className="text-gray-500">Excluded by user preference</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-green-400 font-medium">
                            <span>✓</span> Eligible for Auto-Switch
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isClient ? (
                          <span
                            className="text-gray-600 cursor-not-allowed select-none text-[11px]"
                            title="Client profiles can never be included in automated switches"
                          >
                            Locked
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!isAutoSwitchActive}
                            onClick={() => toggleExcludeProfile(p.id)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                              isExcluded
                                ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                                : "bg-gravity-950 text-gravity-300 border border-gravity-700 hover:bg-gravity-900"
                            } ${!isAutoSwitchActive ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            {isExcluded ? "Include" : "Included (Active)"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-gray-500">
          Simulate auto-switch execution on rate limit:
        </span>
        <button
          type="button"
          onClick={handleTestAutoSwitch}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg border border-gray-700 transition-colors"
        >
          Run Engine Simulation Test
        </button>
      </div>

      {testResult && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs font-mono text-gray-300">
          <p className="font-semibold text-gray-400 mb-1">Engine Evaluation Result:</p>
          <pre className="text-green-400 whitespace-pre-wrap">{testResult}</pre>
        </div>
      )}
    </div>
  );
}
