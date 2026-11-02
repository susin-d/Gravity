import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Profile } from "../pages/Profiles";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

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
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-6 right-6 max-w-md w-full bg-surface-2 border border-amber-600/80 rounded-xl shadow-2xl p-4 z-50"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-950/60 text-amber-400 border border-amber-800/80 flex-shrink-0">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">
              Rate Limit Reached
            </h4>
            <Badge variant="warning">{fromProfile.vendor}</Badge>
          </div>

          <p className="text-xs text-text-secondary mt-1">
            <span className="font-medium text-amber-300">{fromProfile.label}</span> reached its quota limit.
          </p>

          {suggestedProfile ? (
            <p className="text-xs text-text-tertiary mt-0.5">
              Continue in <span className="font-semibold text-text-primary">{suggestedProfile.label}</span>?
            </p>
          ) : (
            <p className="text-xs text-text-tertiary mt-0.5 italic">
              No eligible fallback profile found — Check manually.
            </p>
          )}

          {/* Details toggle */}
          {rawSignal && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-[11px] text-text-tertiary hover:text-text-secondary flex items-center gap-1 transition-colors"
              >
                <span>{showDetails ? "Hide raw limit details" : "View raw limit details"}</span>
                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <AnimatePresence>
                {showDetails && (
                  <motion.pre
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1.5 p-2 bg-surface-1 rounded-lg text-[10px] font-mono text-text-tertiary whitespace-pre-wrap break-all border border-border-subtle"
                  >
                    {rawSignal}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3.5 flex items-center justify-end gap-2 pt-2.5 border-t border-border-subtle">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onStay}
            >
              Stay
            </Button>

            {suggestedProfile ? (
              <Button
                ref={continueBtnRef}
                type="button"
                variant="default"
                size="sm"
                onClick={() => onContinue(suggestedProfile)}
              >
                Continue in {suggestedProfile.label}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onManualSelect}
              >
                Check manually
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
