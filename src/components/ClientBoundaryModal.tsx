import { useEffect, useRef } from "react";
import { Profile } from "../pages/Profiles";

export interface ClientBoundaryModalProps {
  targetProfile: Profile;
  fromProfile?: Profile | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ClientBoundaryModal({
  targetProfile,
  fromProfile,
  onConfirm,
  onCancel,
}: ClientBoundaryModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // STRICT RULE AC-07: Default focus MUST be Cancel button
  useEffect(() => {
    if (cancelBtnRef.current) {
      cancelBtnRef.current.focus();
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-gray-900 border border-amber-600/80 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2.5 text-amber-400">
          <span className="text-xl">🛡️</span>
          <h3 className="text-base font-bold text-gray-100">
            Move to a client account?
          </h3>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          {fromProfile ? (
            <>
              Moving from <strong className="text-gray-200">{fromProfile.label}</strong> into{" "}
              <strong className="text-amber-300 font-semibold">
                {targetProfile.label} ({targetProfile.vendor} · {targetProfile.tag})
              </strong>.
            </>
          ) : (
            <>
              This starts a new session in{" "}
              <strong className="text-amber-300 font-semibold">
                {targetProfile.label} ({targetProfile.vendor} · {targetProfile.tag})
              </strong>.
            </>
          )}
        </p>

        <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
          <p>• Client profile isolation boundaries are active.</p>
          <p>• Automated switching into or out of client accounts is permanently prohibited.</p>
          <p>• This confirmation is strictly per-move and never remembered.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
          {/* Cancel button has strict default focus */}
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg transition-colors focus:ring-2 focus:ring-gray-400 focus:outline-none"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-amber-400 focus:outline-none"
          >
            Start new session in {targetProfile.label}
          </button>
        </div>
      </div>
    </div>
  );
}
