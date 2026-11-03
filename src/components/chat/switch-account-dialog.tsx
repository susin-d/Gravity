import { useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import type { Chat, Profile } from "../../lib/types";
import { tagLabel, vendorLabel } from "../../lib/format";
import type { PageId } from "../../lib/navigation";
import { Badge, tagBadgeVariant } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export interface SwitchAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: Chat;
  profiles: Profile[];
  onSwitched: (chat: Chat) => void;
  onRequestClientConfirm: (profile: Profile) => void;
  onNavigate: (page: PageId) => void;
}

export function SwitchAccountDialog({
  open,
  onOpenChange,
  chat,
  profiles,
  onSwitched,
  onRequestClientConfirm,
  onNavigate,
}: SwitchAccountDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = profiles.filter(
    (profile) => profile.vendor === chat.vendor && profile.id !== chat.profile_id,
  );
  // `null` means "no explicit choice yet", so the first eligible account is
  // preselected without an effect that would fight the radio input.
  const target =
    eligible.find((profile) => profile.id === selectedId) ?? eligible[0] ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) {
      setError("Select an account to switch to.");
      return;
    }

    if (target.tag === "client") {
      onOpenChange(false);
      onRequestClientConfirm(target);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      onSwitched(await api.switchChatProfile(chat.id, target.id, false));
      onOpenChange(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch account</DialogTitle>
          <DialogDescription>
            The next message runs on the new account. Gravity replays this chat's
            transcript because the vendor session belongs to the old account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            {eligible.length === 0 ? (
              <EmptyState
                icon={Users}
                title={`No other ${vendorLabel(chat.vendor)} profiles`}
                description="Create another profile with the same vendor to switch accounts mid-conversation."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onNavigate("profiles");
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
                  const selected = profile.id === target?.id;
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
                        name="chat-switch-target"
                        value={profile.id}
                        checked={selected}
                        onChange={() => setSelectedId(profile.id)}
                        className="mt-1 h-4 w-4 accent-ink"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-ink">
                            {profile.label}
                          </span>
                          <Badge variant={tagBadgeVariant(profile.tag)}>
                            {tagLabel(profile.tag)}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-dim">
                          {vendorLabel(profile.vendor)}
                          {profile.tag === "client"
                            ? " · confirmation required"
                            : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {error && (
              <p role="alert" className="text-xs text-danger-text">
                {error}
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
              disabled={!target}
            >
              Switch account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
