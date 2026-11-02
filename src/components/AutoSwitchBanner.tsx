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

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-surface-2 border border-gravity-600/50 rounded-xl p-3.5 mb-5 shadow-lg flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gravity-600/20 text-gravity-300 border border-gravity-600/30 flex-shrink-0">
          <Zap className="h-4 w-4 animate-pulse" />
        </div>
        <div>
          {lastSwitchedEvent ? (
            <p className="text-xs text-text-primary">
              <strong className="font-semibold text-white">Auto-switched:</strong> Now using{" "}
              <span className="text-gravity-300 font-bold">{lastSwitchedEvent.toProfileName}</span> (switched from{" "}
              {lastSwitchedEvent.fromProfileName} at{" "}
              {new Date(lastSwitchedEvent.switchedAt).toLocaleTimeString()}).
            </p>
          ) : (
            <p className="text-xs text-text-primary">
              <strong className="font-semibold text-white">Auto-switch armed:</strong> Will switch to{" "}
              <span className="text-gravity-300 font-bold">{armedTargetProfileName || "MRU non-client profile"}</span>{" "}
              if a rate limit is reached.
            </p>
          )}
          <p className="text-[10px] text-text-tertiary mt-0.5">
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
