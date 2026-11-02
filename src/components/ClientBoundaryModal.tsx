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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in-0 duration-200">
      <div
        className="rounded-2xl max-w-md w-full p-6 space-y-4 border border-amber-600/40"
        style={{
          background: "rgba(10, 10, 10, 0.94)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 24px 64px rgba(0,0,0,0.90)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-800/60">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              Move to a client account?
            </h3>
            <p className="text-xs text-ink-low">
              Client accounts require explicit confirmation
            </p>
          </div>
        </div>

        <div
          className="text-xs text-ink-mid leading-relaxed p-3.5 rounded-xl border border-edge-subtle space-y-2"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <p>
            {fromProfile ? (
              <>
                Switching from <strong className="text-white">{fromProfile.label}</strong> into{" "}
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

        <div
          className="rounded-xl p-3 text-xs text-ink-low space-y-1.5 border border-edge-subtle"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <p>• Client profile isolation boundaries are active.</p>
          <p>• Automated switching into or out of client accounts is permanently prohibited.</p>
          <p>• This confirmation is strictly per-move and never remembered.</p>
        </div>

        <div className="flex justify-end gap-2.5 pt-2 border-t border-edge-subtle">
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
            size="default"
            onClick={onConfirm}
            className="bg-amber-600/90 hover:bg-amber-500 text-white border border-amber-600/50 hover:border-amber-500 shadow-md hover:shadow-[0_0_16px_rgba(251,191,36,0.30)]"
          >
            Start session in {targetProfile.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
