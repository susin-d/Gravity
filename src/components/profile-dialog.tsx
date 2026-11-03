import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { Profile, Tag, Vendor } from "../lib/types";
import { vendorLabel } from "../lib/format";
import { Badge, vendorBadgeVariant } from "./ui/badge";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ProviderCard } from "./profile-provider-card";
import { ProviderSignInPanel } from "./profile-signin-panel";

const providers: { vendor: Vendor; name: string; tagline: string; packageName: string }[] = [
  {
    vendor: "claude",
    name: "Claude Code",
    tagline: "Anthropic's agentic coding CLI.",
    packageName: "@anthropic-ai/claude-code",
  },
  {
    vendor: "codex",
    name: "OpenAI Codex",
    tagline: "OpenAI's agentic coding CLI.",
    packageName: "@openai/codex",
  },
];

const tagSelect = (value: Tag, onChange: (tag: Tag) => void, disabled = false) => (
  <Select
    id="profile-tag"
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value as Tag)}
  >
    <option value="personal">Personal</option>
    <option value="work">Work</option>
    <option value="client">Client (guarded)</option>
  </Select>
);

export interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: Profile | null;
  onSaved: (profile: Profile) => void;
}

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: ProfileDialogProps) {
  const editing = profile != null;
  const [created, setCreated] = useState<Profile | null>(null);
  const activeProfile = profile ?? created;

  const [label, setLabel] = useState("");
  const [vendor, setVendor] = useState<Vendor>("claude");
  const [tag, setTag] = useState<Tag>("personal");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setCreated(null);
    setLabel(profile?.label ?? "");
    setVendor(profile?.vendor ?? "claude");
    setTag(profile?.tag ?? "personal");
    setFormError(null);
  }, [open, profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      setFormError("Enter a profile label.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (profile) {
        const saved = await api.updateProfile(profile.id, {
          label: trimmedLabel,
          tag,
          secret: null,
          clear_secret: false,
        });
        onSaved(saved);
        onOpenChange(false);
        return;
      }

      const saved = await api.createProfile({
        label: trimmedLabel,
        vendor,
        tag,
        secret: null,
      });
      setCreated(saved);
      onSaved(saved);
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  const title = editing ? "Edit profile" : created ? "Finish sign-in" : "New profile";
  const description = editing
    ? "Update the label or boundary tag, or change how the profile signs in. The vendor and config directory stay fixed."
    : created
      ? "Choose how this profile authenticates. The CLI opens in the sign-in window; Gravity stores nothing itself."
      : "Pick a provider. Gravity installs its CLI if needed, and sign-in is handled by the CLI.";

  const labelField: ReactNode = (
    <Field id="profile-label" label="Label">
      <Input
        id="profile-label"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="e.g. Work, Personal, Acme Corp"
        autoFocus={!activeProfile}
        required
        disabled={created != null}
      />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            {activeProfile ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-ink-muted">Vendor</span>
                  <div className="flex h-9 items-center gap-2 rounded-sm border border-line bg-raised/50 px-2.5 text-sm">
                    <Badge variant={vendorBadgeVariant(activeProfile.vendor)}>
                      {vendorLabel(activeProfile.vendor)}
                    </Badge>
                    <span className="text-xs text-ink-dim">Fixed</span>
                  </div>
                </div>
                <Field id="profile-tag" label="Boundary tag">
                  {tagSelect(tag, setTag, created != null)}
                </Field>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Provider">
                {providers.map((provider) => (
                  <ProviderCard
                    key={provider.vendor}
                    vendor={provider.vendor}
                    name={provider.name}
                    tagline={provider.tagline}
                    packageName={provider.packageName}
                    selected={vendor === provider.vendor}
                    onSelect={setVendor}
                  />
                ))}
              </div>
            )}

            {!activeProfile ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {labelField}
                <Field id="profile-tag" label="Boundary tag">
                  {tagSelect(tag, setTag, created != null)}
                </Field>
              </div>
            ) : (
              <>
                {created ? (
                  <p className="flex items-center gap-2 text-xs text-success-text">
                    <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                    Profile created — {created.label}
                  </p>
                ) : null}
                {labelField}
                <ProviderSignInPanel profile={activeProfile} />
              </>
            )}

            {formError ? (
              <p role="alert" className="text-xs text-danger-text">
                {formError}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            {activeProfile ? (
              editing ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" loading={submitting}>
                    Save changes
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              )
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={submitting}>
                  Create profile
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
