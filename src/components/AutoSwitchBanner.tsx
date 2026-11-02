import { motion } from "framer-motion";
import { Zap, RotateCcw, XCircle } from "lucide-react";
import { Button } from "./ui/button";

export interface AutoSwitchBannerProps {
  flagsEnabled: boolean;
  projectAutoSwitchEnabled: boolean;
  armedTargetProfileName?: string;
  lastSwitchedEvent?: {
    toProfileName: string;
    fromProfileName: string;
    switchedAt: string;
  } | null;
  onDisable: () => void;
  onSwitchBack?: () => void;
}

export default function AutoSwitchBanner({
  flagsEnabled,
  projectAutoSwitchEnabled,
  armedTargetProfileName,
  lastSwitchedEvent,
  onDisable,
  onSwitchBack,
}: AutoSwitchBannerProps) {
  // PRIME DIRECTIVE #4 & AC-10:
  // If master flag is false OR project has not explicitly enabled auto-switch,
  // RENDER NOTHING. Zero reachable UI footprint by default.
  if (!flagsEnabled || !projectAutoSwitchEnabled) {
    return null;
  }

  const isTriggered = !!lastSwitchedEvent;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl p-3.5 mb-5 flex items-center justify-between border"
      style={isTriggered ? {
        background: "rgba(255,255,255,0.07)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        borderColor: "rgba(255,255,255,0.18)",
        boxShadow: "0 0 20px rgba(255,255,255,0.06)",
      } : {
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        borderColor: "rgba(255,255,255,0.09)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-lg border flex-shrink-0"
          style={isTriggered ? {
            background: "rgba(255,255,255,0.12)",
            borderColor: "rgba(255,255,255,0.20)",
            color: "#ffffff",
            boxShadow: "0 0 12px rgba(255,255,255,0.15)",
          } : {
            background: "rgba(255,255,255,0.07)",
            borderColor: "rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.70)",
          }}
        >
          <Zap className="h-4 w-4 animate-glow-pulse" />
        </div>
        <div>
          {lastSwitchedEvent ? (
            <p className="text-xs text-white">
              <strong className="font-semibold">Auto-switched:</strong> Now using{" "}
              <span className="text-white font-bold">{lastSwitchedEvent.toProfileName}</span> (switched from{" "}
              {lastSwitchedEvent.fromProfileName} at{" "}
              {new Date(lastSwitchedEvent.switchedAt).toLocaleTimeString()}).
            </p>
          ) : (
            <p className="text-xs text-white">
              <strong className="font-semibold">Auto-switch armed:</strong> Will switch to{" "}
              <span className="font-bold">{armedTargetProfileName || "MRU non-client profile"}</span>{" "}
              if a rate limit is reached.
            </p>
          )}
          <p className="text-[10px] text-ink-low mt-0.5">
            Client accounts are strictly protected from automated switching.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {lastSwitchedEvent && onSwitchBack && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSwitchBack}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Switch back</span>
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDisable}
          className="flex items-center gap-1.5"
          title="Disable auto-switch for this project"
        >
          <XCircle className="h-3 w-3" />
          <span>Disable</span>
        </Button>
      </div>
    </motion.div>
  );
}
