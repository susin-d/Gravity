import { useEffect, useRef, useState } from "react";
import { Profile } from "../pages/Profiles";

export interface LimitToastProps {
  fromProfile: Profile;
  suggestedProfile?: Profile | null;
  rawSignal?: string;
  onContinue: (targetProfile: Profile) => void;
  onStay: () => void;
  onManualSelect?: () => void;
}

export default function LimitToast({
  fromProfile,
  suggestedProfile,
  rawSignal,
  onContinue,
  onStay,
  onManualSelect,
}: LimitToastProps) {
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const continueBtnRef = useRef<HTMLButtonElement>(null);

  // Focus Continue button by default (only when a clear suggestion exists)
  useEffect(() => {
    if (suggestedProfile && continueBtnRef.current) {
      continueBtnRef.current.focus();
    }
  }, [suggestedProfile]);

  return (
    <div className="fixed bottom-6 right-6 max-w-md w-full bg-gray-900 border border-amber-600/80 rounded-xl shadow-2xl p-4 z-50 animate-slide-up">
      <div className="flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-100">
              Rate Limit Reached
            </h4>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
              {fromProfile.vendor}
            </span>
          </div>

          <p className="text-xs text-gray-300 mt-1">
            <span className="font-medium text-amber-300">{fromProfile.label}</span> reached its limit.
          </p>

          {suggestedProfile ? (
            <p className="text-xs text-gray-400 mt-0.5">
              Continue in <span className="font-semibold text-gray-200">{suggestedProfile.label}</span>?
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5 italic">
              No eligible fallback profile found — Check manually.
            </p>
          )}

          {/* Details toggle */}
          {rawSignal && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-[11px] text-gray-500 hover:text-gray-300 underline"
              >
                {showDetails ? "Hide details" : "View limit details"}
              </button>
              {showDetails && (
                <pre className="mt-1 p-2 bg-gray-950 rounded text-[10px] font-mono text-gray-400 whitespace-pre-wrap break-all border border-gray-800">
                  {rawSignal}
                </pre>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
            <button
              type="button"
              onClick={onStay}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
            >
              Stay
            </button>

            {suggestedProfile ? (
              <button
                ref={continueBtnRef}
                type="button"
                onClick={() => onContinue(suggestedProfile)}
                className="px-3.5 py-1.5 bg-gravity-600 hover:bg-gravity-500 text-white text-xs font-medium rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-gravity-400 focus:outline-none"
              >
                Continue in {suggestedProfile.label}
              </button>
            ) : (
              <button
                type="button"
                onClick={onManualSelect}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg transition-colors"
              >
                Check manually
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
