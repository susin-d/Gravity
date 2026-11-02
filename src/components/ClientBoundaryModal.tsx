import { useEffect, useRef } from "react";
import { ShieldAlert } from "lucide-react";
import { Profile } from "../pages/Profiles";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in-0 duration-200">
      <div className="bg-surface-2 border border-amber-600/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-800/80">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Move to a client account?
            </h3>
            <p className="text-xs text-text-tertiary">
              Client accounts require explicit confirmation
            </p>
          </div>
        </div>

        <div className="text-xs text-text-secondary leading-relaxed bg-surface-1 p-3.5 rounded-xl border border-border-subtle space-y-2">
          <p>
            {fromProfile ? (
              <>
                Switching from <strong className="text-text-primary">{fromProfile.label}</strong> into{" "}
                <strong className="text-amber-300 font-semibold">{targetProfile.label}</strong>.
              </>
            ) : (
              <>
                Starting a new session in{" "}
                <strong className="text-amber-300 font-semibold">{targetProfile.label}</strong>.
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Badge variant="client">{targetProfile.tag}</Badge>
            <Badge variant="neutral">{targetProfile.vendor}</Badge>
          </div>
        </div>

        <div className="bg-surface-0 border border-border-subtle rounded-xl p-3 text-xs text-text-tertiary space-y-1.5">
          <p>• Client profile isolation boundaries are active.</p>
          <p>• Automated switching into or out of client accounts is permanently prohibited.</p>
          <p>• This confirmation is strictly per-move and never remembered.</p>
        </div>

        <div className="flex justify-end gap-2.5 pt-2 border-t border-border-subtle">
          {/* Cancel button has strict default focus per AC-07 */}
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="secondary"
            size="default"
            onClick={onCancel}
          >
            Cancel
          </Button>

          <Button
            type="button"
            className="bg-amber-600 hover:bg-amber-500 text-white border-none shadow-md"
            size="default"
            onClick={onConfirm}
          >
            Start session in {targetProfile.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
