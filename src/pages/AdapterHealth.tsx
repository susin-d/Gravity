import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AdaptersHealthReport {
  claude: "ok" | "degraded";
  codex: "ok" | "degraded";
}

interface LimitEvent {
  id: string;
  session_id: string;
  profile_id: string;
  detected_at: string;
  source: string;
  raw_signal: string;
  detail?: string;
}

interface DetectionResult {
  is_limit: boolean;
  raw_signal: string;
  detail: string;
}

export default function AdapterHealth() {
  const [health, setHealth] = useState<AdaptersHealthReport | null>(null);
  const [limitEvents, setLimitEvents] = useState<LimitEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Line tester state
  const [testVendor, setTestVendor] = useState<"claude" | "codex">("claude");
  const [testLine, setTestLine] = useState<string>("Rate limit reached: 429 Too Many Requests.");
  const [testExitCode, setTestExitCode] = useState<string>("");
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null | undefined>(undefined);

  const loadData = async () => {
    try {
      setLoading(true);
      const [h, events] = await Promise.all([
        invoke<AdaptersHealthReport>("check_adapters_health"),
        invoke<LimitEvent[]>("list_limit_events", { limit: 20 }),
      ]);
      setHealth(h);
      setLimitEvents(events);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestLine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const exitCodeNum = testExitCode.trim() ? parseInt(testExitCode.trim(), 10) : null;
      const res = await invoke<DetectionResult | null>("detect_line_limit", {
        vendor: testVendor,
        line: testLine,
        exitCode: exitCodeNum,
      });
      setDetectionResult(res);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <div>
        <h2 className="text-xl font-bold">Adapter Health & Limit Detection</h2>
        <p className="text-xs text-gray-500 mt-1">
          Real-time parser status and sub-second rate limit heuristic evaluators.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-xs rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Health Badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AdapterCard
          title="Claude Code CLI Adapter"
          vendor="claude"
          status={health?.claude || "ok"}
          description="Parses stdout/stderr for token quota exhaustion, credit balance alerts, and exit codes."
        />
        <AdapterCard
          title="OpenAI Codex CLI Adapter"
          vendor="codex"
          status={health?.codex || "ok"}
          description="Monitors Codex requests per minute limits, insufficient_quota errors, and API rejections."
        />
      </div>

      {/* Live Stream Line Evaluator (AC-04 Verification Tool) */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Rate Limit Evaluator (Sub-second Test)
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Test lines against Claude Code and OpenAI Codex heuristics.
        </p>

        <form onSubmit={handleTestLine} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Vendor</label>
              <select
                value={testVendor}
                onChange={(e) => setTestVendor(e.target.value as "claude" | "codex")}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200"
              >
                <option value="claude">Claude Code</option>
                <option value="codex">OpenAI Codex</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Terminal Output Line</label>
              <input
                type="text"
                value={testLine}
                onChange={(e) => setTestLine(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Exit Code (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 1"
                value={testExitCode}
                onChange={(e) => setTestExitCode(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTestLine("Rate limit reached: 429 Too Many Requests. Reset at 2026-11-03T02:00:00Z.")}
                className="text-[11px] text-gray-500 hover:text-gray-300 underline"
              >
                [Sample Claude 429]
              </button>
              <button
                type="button"
                onClick={() => setTestLine("openai.RateLimitError: Error code: 429 - {'error': {'type': 'insufficient_quota'}}")}
                className="text-[11px] text-gray-500 hover:text-gray-300 underline"
              >
                [Sample Codex Quota]
              </button>
              <button
                type="button"
                onClick={() => setTestLine("Compiled 12 files successfully in 320ms.")}
                className="text-[11px] text-gray-500 hover:text-gray-300 underline"
              >
                [Sample Normal Line]
              </button>
            </div>

            <button
              type="submit"
              className="px-4 py-1.5 bg-gravity-600 hover:bg-gravity-500 text-white text-xs font-medium rounded-lg"
            >
              Evaluate Line
            </button>
          </div>
        </form>

        {/* Evaluation Output */}
        {detectionResult !== undefined && (
          <div className="mt-4 pt-3 border-t border-gray-800 text-xs">
            {detectionResult ? (
              <div className="bg-red-950/40 border border-red-800 text-red-300 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-semibold text-red-200">🚨 Limit Signal Detected!</span>
                  <p className="mt-0.5 text-xs text-red-400">{detectionResult.detail}</p>
                </div>
                <span className="px-2 py-0.5 bg-red-900/60 text-red-300 font-mono text-[10px] rounded uppercase">
                  Triggered
                </span>
              </div>
            ) : (
              <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 p-3 rounded-lg flex items-center justify-between">
                <span>✅ Clean: No rate limit pattern matched.</span>
                <span className="px-2 py-0.5 bg-emerald-900/60 text-emerald-300 font-mono text-[10px] rounded uppercase">
                  Pass
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit: Recent Limit Events Table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Recorded Rate Limit Events
        </h3>
        {loading ? (
          <p className="text-xs text-gray-500 animate-pulse">Loading events…</p>
        ) : limitEvents.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No rate limit events recorded yet.</p>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-gray-800/50 text-gray-400 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Detected At</th>
                  <th className="p-3">Profile ID</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Raw Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {limitEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-gray-800/30">
                    <td className="p-3 text-gray-400">{new Date(evt.detected_at).toLocaleTimeString()}</td>
                    <td className="p-3 text-gray-300">{evt.profile_id.slice(0, 8)}…</td>
                    <td className="p-3 text-amber-400 uppercase text-[10px]">{evt.source}</td>
                    <td className="p-3 text-gray-300 truncate max-w-md" title={evt.raw_signal}>
                      {evt.raw_signal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdapterCard({
  title,
  vendor,
  status,
  description,
}: {
  title: string;
  vendor: string;
  status: "ok" | "degraded";
  description: string;
}) {
  const isOk = status === "ok";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-200">{title}</h4>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
            isOk
              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
              : "bg-red-950 text-red-400 border border-red-800"
          }`}
        >
          {isOk ? "Active (OK)" : "Degraded"}
        </span>
      </div>

      <p className="text-xs text-gray-400">{description}</p>

      <div className="pt-2 border-t border-gray-800 text-[11px] text-gray-500 font-mono">
        Vendor ID: <span className="text-gray-400">{vendor}</span>
      </div>
    </div>
  );
}
