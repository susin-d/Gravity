import { useState, useMemo } from "react";
import { Users, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Profile } from "../../../pages/Profiles";
import { UsageReading } from "../../UsageBadge";

interface ProfilesPanelProps {
  profiles: Profile[];
  usages?: Record<string, UsageReading>;
  selectedProfileId: string | null;
  onSelectProfile: (id: string) => void;
}

export default function ProfilesPanel({
  profiles,
  usages = {},
  selectedProfileId,
  onSelectProfile,
}: ProfilesPanelProps) {
  const [vendorFilter, setVendorFilter] = useState<"all" | "claude" | "codex">("all");

  const filtered = useMemo(() => {
    if (vendorFilter === "all") return profiles;
    return profiles.filter((p) => p.vendor === vendorFilter);
  }, [profiles, vendorFilter]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-subtle px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-white" />
          <span className="text-xs font-semibold text-white">Profiles & Keyring</span>
        </div>
      </div>

      {/* Vendor Filter */}
      <div className="border-b border-edge-subtle p-2 flex items-center gap-1 text-[10px] bg-glass-1">
        {(["all", "claude", "codex"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVendorFilter(v)}
            className={`rounded-md px-2 py-0.5 uppercase tracking-wider font-mono transition-colors ${
              vendorFilter === v
                ? "bg-white text-black font-semibold"
                : "text-ink-low hover:bg-glass-2 hover:text-white"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Profiles List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-ink-low">
            No profiles found
          </div>
        ) : (
          filtered.map((prof) => {
            const isSelected = prof.id === selectedProfileId;
            const usage = usages[prof.id];

            return (
              <button
                key={prof.id}
                type="button"
                onClick={() => onSelectProfile(prof.id)}
                className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-all ${
                  isSelected
                    ? "bg-[#181818] border border-edge-DEFAULT text-white shadow-md"
                    : "text-ink-mid hover:bg-glass-2 hover:text-white border border-transparent"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        prof.vendor === "claude" ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                    />
                    <span className="truncate text-xs font-medium">{prof.label}</span>
                  </div>

                  {prof.tag === "client" ? (
                    <span className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-mono border border-rose-500/30 text-rose-300 bg-rose-950/20">
                      <ShieldAlert className="h-2.5 w-2.5" />
                      client
                    </span>
                  ) : (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-mono border border-edge-subtle text-ink-low">
                      {prof.tag}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px] text-ink-low font-mono">
                  <span>{prof.vendor}</span>
                  <span>
                    {usage
                      ? usage.source === "unknown"
                        ? "usage unknown"
                        : usage.source
                      : "no reading"}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-edge-subtle px-3 py-2 text-[10px] text-ink-low font-mono flex justify-between">
        <span>{filtered.length} profiles</span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
          Isolated
        </span>
      </div>
    </div>
  );
}
