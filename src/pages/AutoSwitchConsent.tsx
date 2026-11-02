import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { Shield, Lock, CheckCircle2 } from "lucide-react";
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

export default function AutoSwitchConsent() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [excludedProfileIds, setExcludedProfileIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const isAutoSwitchActive = settings?.flags?.auto_switch ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-4xl space-y-6"
    >
      <div className="flex items-center justify-between border-b border-edge-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white">
              Auto-Switch Policies & Consent
            </h2>
            <Badge variant="warning">M6 Guarded</Badge>
          </div>
          <p className="text-xs text-ink-low mt-1">
            Automated profile switching on rate limit detection. Governed by flags.toml and client isolation barriers.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-200 text-xs p-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Feature Flag Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-white" />
            <span>Master Capability Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  Automated Switch Engine:
                </span>
                <Badge variant={isAutoSwitchActive ? "success" : "neutral"}>
                  {isAutoSwitchActive ? "ARMED (flags.toml: true)" : "DISARMED (flags.toml: false)"}
                </Badge>
              </div>
              <p className="text-xs text-ink-low">
                Requires explicit flag enablement in <code className="text-ink-mid bg-glass-3 px-1 py-0.5 rounded font-mono">flags.toml</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Isolation Notice */}
      <div className="bg-glass-2 border border-edge-subtle rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-white text-xs font-semibold">
          <Lock className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span>Security &amp; Client Data Isolation Rules</span>
        </div>
        <ul className="text-xs text-ink-mid space-y-1.5 list-disc pl-5">
          <li>
            <strong className="text-white">Strict Client Exemption:</strong> Projects or profiles tagged as{" "}
            <Badge variant="client" className="mx-1">CLIENT</Badge> are permanently blocked from auto-switching.
          </li>
          <li>
            <strong className="text-white">Vendor Matching:</strong> Automated fallback only switches within the same vendor ecosystem (Claude Code &rarr; Claude Code, Codex &rarr; Codex).
          </li>
          <li>
            <strong className="text-white">Audit Log:</strong> Every automated switch writes an immutable event into SQLite with policy snapshot and timestamp.
          </li>
        </ul>
      </div>

      {/* Profile Allowlist Matrix */}
      <div className="space-y-3">
        <h3 className="section-heading">Auto-Switch Profile Allowlist</h3>
        {loading ? (
          <div className="text-xs text-ink-low">Loading profile inventory...</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-glass-1 text-ink-low uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Profile Label</th>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Tag</th>
                  <th className="p-3">Policy Eligibility</th>
                  <th className="p-3 text-right">Inclusion Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {profiles.map((p) => {
                  const isClient = p.tag === "client";
                  const isExcluded = excludedProfileIds.has(p.id);

                  return (
                    <tr key={p.id} className="hover:bg-glass-3 transition-colors">
                      <td className="p-3 font-medium text-white">{p.label}</td>
                      <td className="p-3">
                        <Badge variant={p.vendor === "claude" ? "claude" : "codex"}>
                          {p.vendor}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={p.tag}>{p.tag}</Badge>
                      </td>
                      <td className="p-3">
                        {isClient ? (
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <Lock className="h-3 w-3" />
                            <span>Hard Blocked (Client)</span>
                          </div>
                        ) : isExcluded ? (
                          <div className="flex items-center gap-1.5 text-ink-low">
                            <span>Manually Excluded</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Eligible for Fallback</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isClient ? (
                          <span className="text-[11px] text-ink-low italic">
                            Non-configurable
                          </span>
                        ) : (
                          <Button
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
    </motion.div>
  );
}
