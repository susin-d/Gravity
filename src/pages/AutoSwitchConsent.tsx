import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { Shield, AlertTriangle, Play, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-4xl space-y-6"
    >
      <div className="flex items-center justify-between border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary">
              Auto-Switch Consent & Allowlist
            </h2>
          </div>
          <p className="text-xs text-text-tertiary mt-0.5">
            Automated session rate-limit recovery policy engine (Milestone M6)
          </p>
        </div>
        <Badge variant={isAutoSwitchActive ? "success" : "neutral"} className="px-3 py-1 text-xs">
          {isAutoSwitchActive ? "Engine Armed (Flag Active)" : "Engine Gated (Flag Disabled)"}
        </Badge>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Flag Gate Status Card */}
      {!isAutoSwitchActive && (
        <Card className="border-amber-800/60 bg-amber-950/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Master Feature Flag Is Inactive</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-amber-200/80 leading-relaxed">
            <p>
              Per <strong>Prime Directive #4</strong> and <strong>Acceptance Criterion AC-10</strong>, the auto-switch policy engine is strictly gated.
              To enable this engine, edit <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono">flags.toml</code> in{" "}
              <code className="text-text-primary">{settings?.app_data_dir || "%APPDATA%\\Gravity"}</code> and set:
            </p>
            <pre className="bg-black/50 p-2.5 rounded-lg text-xs font-mono text-text-secondary">auto_switch = true</pre>
          </CardContent>
        </Card>
      )}

      {/* Prime Directive Policy Shield Banner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Shield className="h-4 w-4 text-gravity-400" />
            <span>Security & Boundary Isolation Rules</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-3.5 space-y-1">
              <span className="font-semibold text-text-primary block">Session Boundary Only</span>
              <p className="text-text-tertiary leading-relaxed">
                Switches only execute when an active CLI session halts on a 429 or quota limit error.
              </p>
            </div>
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-3.5 space-y-1">
              <span className="font-semibold text-amber-400 block">Client Account Lockout</span>
              <p className="text-text-tertiary leading-relaxed">
                Profiles tagged <code className="text-amber-300">client</code> are strictly immutable and never auto-switched.
              </p>
            </div>
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-3.5 space-y-1">
              <span className="font-semibold text-sky-400 block">Audit Guaranteed</span>
              <p className="text-text-tertiary leading-relaxed">
                Every switch attempt logs an immutable record into SQLite table <code className="text-sky-300 font-mono">switch_events</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Allowlist & Profile Eligibility Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Profile Auto-Switch Allowlist</h3>
          <span className="text-xs text-text-tertiary">
            {profiles.filter((p) => p.tag !== "client").length} eligible profiles
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-text-tertiary text-xs">Loading profiles…</div>
        ) : profiles.length === 0 ? (
          <div className="p-8 text-center card text-text-tertiary text-xs">
            No profiles registered. Create profiles in the Profiles tab first.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-1 border-b border-border-subtle text-text-tertiary uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Profile</th>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4">Tag</th>
                  <th className="py-3 px-4">Eligibility Status</th>
                  <th className="py-3 px-4 text-right">Allowlist State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {profiles.map((p) => {
                  const isClient = p.tag === "client";
                  const isExcluded = excludedProfileIds.has(p.id);

                  return (
                    <tr key={p.id} className="hover:bg-surface-3 transition-colors">
                      <td className="py-3 px-4 font-medium text-text-primary">
                        {p.label}
                      </td>
                      <td className="py-3 px-4 text-text-tertiary font-mono capitalize">
                        {p.vendor}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={p.tag}>{p.tag}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        {isClient ? (
                          <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                            <Lock className="h-3 w-3" /> Excluded by Client Boundary
                          </span>
                        ) : isExcluded ? (
                          <span className="text-text-tertiary">Excluded by user preference</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Eligible for Auto-Switch
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isClient ? (
                          <span
                            className="text-text-tertiary cursor-not-allowed select-none text-[11px]"
                            title="Client profiles can never be included in automated switches"
                          >
                            Locked
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant={isExcluded ? "secondary" : "default"}
                            disabled={!isAutoSwitchActive}
                            onClick={() => toggleExcludeProfile(p.id)}
                            className="h-7 px-2.5 text-[11px]"
                          >
                            {isExcluded ? "Include" : "Included"}
                          </Button>
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
        <span className="text-xs text-text-tertiary">
          Simulate auto-switch execution on rate limit:
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleTestAutoSwitch}
          className="flex items-center gap-1.5"
        >
          <Play className="h-3 w-3" />
          <span>Run Engine Simulation Test</span>
        </Button>
      </div>

      {testResult && (
        <div className="card p-4 text-xs font-mono text-text-secondary">
          <p className="font-semibold text-text-primary mb-1">Engine Evaluation Result:</p>
          <pre className="text-emerald-400 whitespace-pre-wrap">{testResult}</pre>
        </div>
      )}
    </motion.div>
  );
}
