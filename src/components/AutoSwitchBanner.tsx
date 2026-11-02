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
    <div className="bg-gravity-950/80 border border-gravity-700/80 rounded-xl p-3.5 mb-5 shadow-lg flex items-center justify-between animate-fade-in">
      <div className="flex items-center gap-2.5">
        <span className="text-base animate-pulse">⚡</span>
        <div>
          {lastSwitchedEvent ? (
            <p className="text-xs text-gravity-200">
              <strong className="text-white font-semibold">Auto-switched:</strong> Now using{" "}
              <span className="text-gravity-400 font-bold">{lastSwitchedEvent.toProfileName}</span> (switched from{" "}
              {lastSwitchedEvent.fromProfileName} at{" "}
              {new Date(lastSwitchedEvent.switchedAt).toLocaleTimeString()}).
            </p>
          ) : (
            <p className="text-xs text-gravity-200">
              <strong className="text-white font-semibold">Auto-switch armed:</strong> Will switch to{" "}
              <span className="text-gravity-400 font-bold">{armedTargetProfileName || "MRU non-client profile"}</span>{" "}
              if a rate limit is reached.
            </p>
          )}
          <p className="text-[10px] text-gray-500 mt-0.5">
            Client accounts are strictly protected from automated switching.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {lastSwitchedEvent && onSwitchBack && (
          <button
            type="button"
            onClick={onSwitchBack}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg transition-colors"
          >
            Switch back
          </button>
        )}
        <button
          type="button"
          onClick={onDisable}
          className="px-3 py-1 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 text-xs rounded-lg transition-colors"
          title="Disable auto-switch for this project"
        >
          Disable
        </button>
      </div>
    </div>
  );
}
