import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, Smartphone, SquareTerminal } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { CredentialStatus, Profile, ProviderAuthStatus } from "../lib/types";
import { Badge, type BadgeVariant } from "./ui/badge";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";

type Action = "sign_in" | "device_auth" | "sign_out" | "remove" | null;

function statusView(
  credential: CredentialStatus | null,
  auth: ProviderAuthStatus | null,
): { variant: BadgeVariant; label: string; detail: string } {
  if (credential === "stored") {
    return {
      variant: "success",
      label: "Credential Manager",
      detail:
        "A stored key is injected for this profile. The CLI uses it instead of its own sign-in.",
    };
  }

  switch (auth?.status) {
    case "signed_in":
      return {
        variant: "success",
        label: "CLI signed in",
        detail: auth.detail || "The CLI reports an active sign-in for this profile.",
      };
    case "signed_out":
      return {
        variant: "neutral",
        label: "Not signed in",
        detail: auth.detail || "The CLI reports no active sign-in for this profile.",
      };
    default:
      return {
        variant: "warning",
        label: "Unavailable",
        detail: auth?.detail ?? "Sign-in status is unavailable.",
      };
  }
}

export function ProviderSignInPanel({ profile }: { profile: Profile }) {
  const isCodex = profile.vendor === "codex";
  const keyFieldId = `profile-api-key-${profile.id}`;

  const [credential, setCredential] = useState<CredentialStatus | null>(null);
  const [auth, setAuth] = useState<ProviderAuthStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [applying, setApplying] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const [cred, status] = await Promise.all([
        api.profileCredentialStatus(profile.id),
        api.providerAuthStatus(profile.id),
      ]);
      setCredential(cred);
      setAuth(status);
    } catch {
      setCredential(null);
      setAuth(null);
    } finally {
      setChecking(false);
    }
  }, [profile.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openTerminal(method: "sign_in" | "device_auth") {
    setAction(method);
    setError(null);
    setNote(null);
    try {
      setNote(await api.spawnProviderLogin(profile.id, method));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  }

  async function signOut() {
    setAction("sign_out");
    setError(null);
    setNote(null);
    try {
      await api.signOutProvider(profile.id);
      setNote("Signed out.");
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  }

  async function applyKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim()) {
      setError("Enter an API key.");
      return;
    }
    setApplying(true);
    setError(null);
    setNote(null);
    try {
      await api.signInWithApiKey(profile.id, apiKey);
      setApiKey("");
      setNote(isCodex ? "Signed in with an API key." : "Key stored in Windows Credential Manager.");
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setApplying(false);
    }
  }

  async function removeKey() {
    setAction("remove");
    setError(null);
    setNote(null);
    try {
      await api.removeProfileSecret(profile.id);
      setNote("Stored key removed.");
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAction(null);
    }
  }

  const loadingFirst = checking && credential === null && auth === null;
  const view = statusView(credential, auth);

  return (
    <section
      aria-label="Sign in"
      className="space-y-3 rounded-lg border border-line bg-raised/40 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-muted">Sign-in</span>
        {loadingFirst ? (
          <span className="text-xs text-ink-dim">Checking…</span>
        ) : (
          <Badge variant={view.variant}>{view.label}</Badge>
        )}
      </div>

      {!loadingFirst ? (
        <p className="text-[11px] leading-snug text-ink-dim">{view.detail}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void openTerminal("sign_in")}
          loading={action === "sign_in"}
        >
          <SquareTerminal className="h-3.5 w-3.5" aria-hidden />
          Sign in in a window
        </Button>
        {isCodex ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openTerminal("device_auth")}
            loading={action === "device_auth"}
            title="Device code flow for headless machines or blocked browser callbacks"
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Device code
          </Button>
        ) : null}
        {isCodex && auth?.status === "signed_in" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            loading={action === "sign_out"}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </Button>
        ) : null}
      </div>

      <form onSubmit={applyKey} className="space-y-2 border-t border-line pt-3">
        <Field
          id={keyFieldId}
          label={isCodex ? "API key" : "API key (Credential Manager)"}
          hint={
            isCodex
              ? "Piped to `codex login --with-api-key` for this profile's config directory. The key is never logged or shown again."
              : "Stored in Windows Credential Manager and injected as ANTHROPIC_API_KEY for this profile."
          }
        >
          <div className="flex gap-2">
            <Input
              id={keyFieldId}
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-…"
              autoComplete="off"
              disabled={applying}
              className="font-mono"
            />
            <Button type="submit" variant="secondary" size="md" loading={applying}>
              Apply
            </Button>
          </div>
        </Field>
      </form>

      {credential === "stored" ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void removeKey()}
          loading={action === "remove"}
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          Remove stored key
        </Button>
      ) : null}

      {note ? (
        <p role="status" className="text-[11px] text-info-text">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[11px] text-danger-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
