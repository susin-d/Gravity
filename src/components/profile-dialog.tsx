import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../lib/api";
import type { CredentialStatus, Profile, Tag, Vendor } from "../lib/types";
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

const credentialLabels: Record<CredentialStatus, string> = {
  stored: "Stored in Windows Credential Manager",
  missing: "No credential stored",
  unknown: "Credential status unavailable",
};

const credentialVariants: Record<CredentialStatus, "success" | "neutral" | "warning"> =
  {
    stored: "success",
    missing: "neutral",
    unknown: "warning",
  };

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
  const [label, setLabel] = useState("");
  const [vendor, setVendor] = useState<Vendor>("claude");
  const [tag, setTag] = useState<Tag>("personal");
  const [secret, setSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [credential, setCredential] = useState<CredentialStatus | null>(null);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setLabel(profile?.label ?? "");
    setVendor(profile?.vendor ?? "claude");
    setTag(profile?.tag ?? "personal");
    setSecret("");
    setClearSecret(false);
    setFormError(null);
    setCredential(null);

    if (!profile) {
      setCredentialLoading(false);
      return;
    }

    let active = true;
    setCredentialLoading(true);
    api
      .profileCredentialStatus(profile.id)
      .then((status) => {
        if (active) setCredential(status);
      })
      .catch(() => {
        if (active) setCredential("unknown");
      })
      .finally(() => {
        if (active) setCredentialLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      setFormError("Enter a profile label.");
      return;
    }
    if (clearSecret && secret.trim()) {
      setFormError("Provide a replacement credential or remove the existing one, not both.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const saved = profile
        ? await api.updateProfile(profile.id, {
            label: trimmedLabel,
            tag,
            secret: secret.trim() ? secret.trim() : null,
            clear_secret: clearSecret,
          })
        : await api.createProfile({
            label: trimmedLabel,
            vendor,
            tag,
            secret: secret.trim() ? secret.trim() : null,
          });

      onOpenChange(false);
      onSaved(saved);
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
          <DialogTitle>{editing ? "Edit profile" : "New profile"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the label, boundary tag, or stored credential. The vendor and config directory stay fixed."
              : "Each profile gets its own config directory and vendor environment variables."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Field id="profile-label" label="Label">
              <Input
                id="profile-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Work, Personal, Acme Corp"
                autoFocus
                required
              />
            </Field>

            {profile ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-ink-muted">Vendor</span>
                  <div className="flex h-9 items-center gap-2 rounded-sm border border-line bg-raised/50 px-2.5 text-sm">
                    <Badge variant={vendorBadgeVariant(profile.vendor)}>
                      {vendorLabel(profile.vendor)}
                    </Badge>
                    <span className="text-xs text-ink-dim">Fixed</span>
                  </div>
                </div>
                <Field id="profile-tag" label="Boundary tag">
                  <Select
                    id="profile-tag"
                    value={tag}
                    onChange={(event) => setTag(event.target.value as Tag)}
                  >
                    <option value="personal">Personal</option>
                    <option value="work">Work</option>
                    <option value="client">Client (guarded)</option>
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="profile-vendor" label="Vendor">
                  <Select
                    id="profile-vendor"
                    value={vendor}
                    onChange={(event) => setVendor(event.target.value as Vendor)}
                  >
                    <option value="claude">Claude Code</option>
                    <option value="codex">OpenAI Codex</option>
                  </Select>
                </Field>
                <Field id="profile-tag" label="Boundary tag">
                  <Select
                    id="profile-tag"
                    value={tag}
                    onChange={(event) => setTag(event.target.value as Tag)}
                  >
                    <option value="personal">Personal</option>
                    <option value="work">Work</option>
                    <option value="client">Client (guarded)</option>
                  </Select>
                </Field>
              </div>
            )}

            {profile && (
              <div className="space-y-2 rounded-lg border border-line bg-raised/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-muted">Credential</span>
                  {credentialLoading ? (
                    <span className="text-xs text-ink-dim">Checking…</span>
                  ) : credential ? (
                    <Badge variant={credentialVariants[credential]}>
                      {credentialLabels[credential]}
                    </Badge>
                  ) : null}
                </div>
                <p className="break-all font-mono text-[11px] text-ink-dim">
                  {profile.config_dir}
                </p>
              </div>
            )}

            <Field
              id="profile-secret"
              label={editing ? "Replace credential" : "API key or token"}
              hint={
                editing
                  ? "Leave blank to keep the current credential. The value is never displayed."
                  : "Optional. Stored in Windows Credential Manager. Leave blank to sign in through the CLI."
              }
            >
              <Input
                id="profile-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={editing ? "New key or token" : "Optional"}
                autoComplete="off"
                disabled={clearSecret}
              />
            </Field>

            {profile && (
              <label className="flex items-start gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={clearSecret}
                  onChange={(event) => setClearSecret(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-sm border border-line bg-canvas accent-ink"
                />
                Remove the stored credential and fall back to CLI sign-in
              </label>
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
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              {editing ? "Save changes" : "Create profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
