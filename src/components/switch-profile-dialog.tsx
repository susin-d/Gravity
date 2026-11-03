import { useEffect, useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { Profile, Session, SwitchExecutionResult } from "../lib/types";
import { tagLabel, vendorLabel } from "../lib/format";
import { useAppData } from "../state/AppData";
import { Badge, tagBadgeVariant, vendorBadgeVariant } from "./ui/badge";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Skeleton } from "./ui/skeleton";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export interface ClientSwitchRequest {
  session: Session;
  fromProfile: Profile;
  toProfile: Profile;
}

export interface SwitchProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  onRequestClientConfirm: (request: ClientSwitchRequest) => void;
  onSwitched: (result: SwitchExecutionResult) => void;
  onManageProfiles: () => void;
}

export function SwitchProfileDialog({
  open,
  onOpenChange,
  session,
  onRequestClientConfirm,
  onSwitched,
  onManageProfiles,
}: SwitchProfileDialogProps) {
  const { profiles, projects } = useAppData();
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fromProfile = session
    ? (profiles.find((profile) => profile.id === session.profile_id) ?? null)
    : null;
  const project = session?.project_id
    ? (projects.find((candidate) => candidate.id === session.project_id) ?? null)
    : null;
  const eligible = fromProfile
    ? profiles.filter(
        (profile) =>
          profile.id !== fromProfile.id && profile.vendor === fromProfile.vendor,
      )
    : [];
  const targetProfile =
    eligible.find((profile) => profile.id === targetId) ?? null;

  useEffect(() => {
    if (!open || !session) return;

    setFormError(null);
    setSubmitting(false);
    setSuggestedId(null);
    setTargetId(null);
    setLoadingSuggestion(true);

    let active = true;
    api
      .suggestFallbackProfile(session.profile_id)
      .then((suggestion) => {
        if (!active) return;
        setSuggestedId(suggestion?.id ?? null);
        setTargetId(suggestion?.id ?? null);
      })
      .catch(() => {
        if (active) setSuggestedId(null);
      })
      .finally(() => {
        if (active) setLoadingSuggestion(false);
      });

    return () => {
      active = false;
    };
  }, [open, session]);

  useEffect(() => {
    if (!open || targetId || loadingSuggestion) return;
    if (eligible.length > 0) setTargetId(eligible[0].id);
  }, [open, targetId, loadingSuggestion, eligible]);

  if (!session) return null;
  const activeSession = session;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fromProfile || !targetProfile) {
      setFormError("Select a profile to switch to.");
      return;
    }

    if (fromProfile.tag === "client" || targetProfile.tag === "client") {
      onOpenChange(false);
      onRequestClientConfirm({
        session: activeSession,
        fromProfile,
        toProfile: targetProfile,
      });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const result = await api.executeProfileSwitch({
        sessionId: activeSession.id,
        fromProfileId: fromProfile.id,
        toProfileId: targetProfile.id,
        projectId: activeSession.project_id,
        reason: "manual",
        clientConfirmed: false,
      });

      if (result.requires_client_confirmation) {
        onOpenChange(false);
        onRequestClientConfirm({
          session: activeSession,
          fromProfile,
          toProfile: targetProfile,
        });
        return;
      }

      onOpenChange(false);
      onSwitched(result);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch profile</DialogTitle>
          <DialogDescription>
            A new session starts with the selected profile. The current session stays
            open and untouched.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="rounded-lg border border-line bg-raised/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-dim">From</span>
                <span className="font-medium text-ink">
                  {fromProfile?.label ?? "Unknown profile"}
                </span>
                {fromProfile && (
                  <Badge variant={vendorBadgeVariant(fromProfile.vendor)}>
                    {vendorLabel(fromProfile.vendor)}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {project ? project.name : "Home directory"}
              </p>
            </div>

            {loadingSuggestion ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : eligible.length === 0 ? (
              <EmptyState
                icon={Users}
                title={`No other ${fromProfile ? vendorLabel(fromProfile.vendor) : ""} profiles`}
                description="Create another profile with the same vendor to switch accounts."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onManageProfiles();
                    }}
                  >
                    Manage profiles
                  </Button>
                }
              />
            ) : (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs font-medium text-ink-muted">
                  Switch to
                </legend>
                {eligible.map((profile) => {
                  const selected = profile.id === targetId;
                  const suggested = profile.id === suggestedId;
                  return (
                    <label
                      key={profile.id}
                      className={`flex cursor-pointer items-start gap-3 rounded border p-2.5 transition-colors ${
                        selected
                          ? "border-line-strong bg-hover"
                          : "border-line bg-panel hover:bg-raised"
                      }`}
                    >
                      <input
                        type="radio"
                        name="switch-target"
                        value={profile.id}
                        checked={selected}
                        onChange={() => setTargetId(profile.id)}
                        className="mt-1 h-4 w-4 accent-ink"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-ink">
                            {profile.label}
                          </span>
                          {suggested && <Badge variant="info">Suggested</Badge>}
                          <Badge variant={tagBadgeVariant(profile.tag)}>
                            {tagLabel(profile.tag)}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-dim">
                          {vendorLabel(profile.vendor)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {formError && (
              <p role="alert" className="text-xs text-danger-text">
                {formError}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
              disabled={!targetProfile}
            >
              Switch session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
