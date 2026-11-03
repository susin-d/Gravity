import { useRef } from "react";
import { ShieldAlert } from "lucide-react";
import type { Profile } from "../lib/types";
import { vendorLabel } from "../lib/format";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export interface ClientBoundaryModalProps {
  open: boolean;
  targetProfile: Profile;
  fromProfile?: Profile | null;
  projectName?: string | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ClientBoundaryModal({
  open,
  targetProfile,
  fromProfile,
  projectName,
  loading = false,
  onConfirm,
  onCancel,
}: ClientBoundaryModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onCancel();
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-danger-text" aria-hidden />
            Client boundary
          </DialogTitle>
          <DialogDescription>
            You are about to start a session with a client-tagged account. Client
            accounts are never auto-switched, and this action is recorded in
            Activity.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-dim">From</dt>
            <dd className="text-ink-muted">
              {fromProfile ? fromProfile.label : "New session"}
            </dd>

            <dt className="text-ink-dim">To</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-ink">{targetProfile.label}</span>
              <Badge variant="tag-client">Client</Badge>
              <Badge variant={targetProfile.vendor}>{vendorLabel(targetProfile.vendor)}</Badge>
            </dd>

            {projectName && (
              <>
                <dt className="text-ink-dim">Project</dt>
                <dd className="text-ink-muted">{projectName}</dd>
              </>
            )}
          </dl>
        </DialogBody>

        <DialogFooter>
          <Button
            ref={cancelRef}
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button variant="warning" size="sm" loading={loading} onClick={onConfirm}>
            Continue to client account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
