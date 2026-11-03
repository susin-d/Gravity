import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { CredentialStatus, Profile, ProviderAuthStatus } from "../lib/types";
import { formatDate, tagLabel, vendorLabel } from "../lib/format";
import { useAppData } from "../state/AppData";
import { Badge, tagBadgeVariant, vendorBadgeVariant } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { EmptyState } from "../components/ui/empty-state";
import { SkeletonRows } from "../components/ui/skeleton";
import { PageHeader } from "../components/layout/page-header";
import {
  Table,
  TableShell,
  tableHeadRow,
  tableRow,
  td,
  th,
} from "../components/ui/table";
import { UsageBadge } from "../components/ui/usage-badge";
import { useToast } from "../components/ui/toast";
import { ProfileDialog } from "../components/profile-dialog";

function credentialView(
  credential: CredentialStatus | undefined,
  auth: ProviderAuthStatus | undefined,
): { variant: "success" | "neutral" | "warning"; label: string } {
  if (credential === "stored") return { variant: "success", label: "Stored" };
  if (auth?.status === "signed_in") return { variant: "success", label: "CLI signed in" };
  if (auth?.status === "signed_out") return { variant: "neutral", label: "Not signed in" };
  if (credential === "missing") return { variant: "neutral", label: "CLI sign-in" };
  return { variant: "warning", label: "Unavailable" };
}

export function ProfilesPage() {
  const { profiles, usages, loading, refresh, refreshUsage } = useAppData();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [credentials, setCredentials] = useState<
    Record<string, CredentialStatus>
  >({});
  const [authStatuses, setAuthStatuses] = useState<
    Record<string, ProviderAuthStatus>
  >({});
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (profiles.length === 0) {
      setCredentials({});
      return;
    }

    void Promise.all(
      profiles.map(async (profile) => {
        try {
          const status = await api.profileCredentialStatus(profile.id);
          return [profile.id, status] as const;
        } catch {
          return [profile.id, "unknown"] as const;
        }
      }),
    ).then((entries) => {
      if (active) setCredentials(Object.fromEntries(entries));
    });

    const codexProfiles = profiles.filter((profile) => profile.vendor === "codex");
    if (codexProfiles.length === 0) {
      setAuthStatuses({});
    } else {
      void Promise.all(
        codexProfiles.map(async (profile) => {
          try {
            const status = await api.providerAuthStatus(profile.id);
            return [profile.id, status] as const;
          } catch {
            return [
              profile.id,
              { status: "unknown", detail: "Sign-in status unavailable." } satisfies ProviderAuthStatus,
            ] as const;
          }
        }),
      ).then((entries) => {
        if (active) setAuthStatuses(Object.fromEntries(entries));
      });
    }

    return () => {
      active = false;
    };
  }, [profiles]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteProfile(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
      toast({ variant: "success", title: "Profile deleted" });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not delete the profile",
        description: errorMessage(cause),
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleRefreshUsage(profile: Profile) {
    setRefreshingId(profile.id);
    try {
      const reading = await refreshUsage(profile.id);
      const available = reading.source !== "unknown";
      toast({
        variant: available ? "success" : "info",
        title: available ? "Usage updated" : "Usage unavailable",
        description:
          reading.detail ??
          (available ? "Reading verified." : "No verified reading is available."),
      });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not check usage",
        description: errorMessage(cause),
      });
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profiles"
        description="Each profile binds a vendor, a boundary tag, and an isolated config directory. Sign in through the CLI, or store a key in Windows Credential Manager."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New profile
          </Button>
        }
      />

      {loading && profiles.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No profiles yet"
          description="Create a Claude Code or OpenAI Codex profile to launch isolated sessions. Client-tagged profiles always require confirmation."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Create profile
            </Button>
          }
        />
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr className={tableHeadRow}>
                <th scope="col" className={th}>Profile</th>
                <th scope="col" className={th}>Vendor</th>
                <th scope="col" className={th}>Tag</th>
                <th scope="col" className={th}>Credential</th>
                <th scope="col" className={th}>Usage</th>
                <th scope="col" className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => {
                const credential = credentials[profile.id];
                const view = credentialView(credential, authStatuses[profile.id]);
                const showChecking = credential === undefined && !authStatuses[profile.id];
                return (
                  <tr key={profile.id} className={tableRow}>
                    <td className={td}>
                      <p className="font-medium text-ink">{profile.label}</p>
                      <p className="mt-0.5 text-[11px] text-ink-dim">
                        Created {formatDate(profile.created_at)}
                      </p>
                    </td>
                    <td className={td}>
                      <Badge variant={vendorBadgeVariant(profile.vendor)}>
                        {vendorLabel(profile.vendor)}
                      </Badge>
                    </td>
                    <td className={td}>
                      <Badge variant={tagBadgeVariant(profile.tag)}>
                        {tagLabel(profile.tag)}
                      </Badge>
                    </td>
                    <td className={td}>
                      {showChecking ? (
                        <span className="text-xs text-ink-dim">Checking…</span>
                      ) : (
                        <Badge variant={view.variant}>{view.label}</Badge>
                      )}
                    </td>
                    <td className={td}>
                      <UsageBadge
                        reading={usages[profile.id]}
                        compact
                        refreshing={refreshingId === profile.id}
                        onRefresh={() => void handleRefreshUsage(profile)}
                      />
                    </td>
                    <td className={td}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(profile);
                            setDialogOpen(true);
                          }}
                          aria-label={`Edit ${profile.label}`}
                          title="Edit profile"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(profile)}
                          aria-label={`Delete ${profile.label}`}
                          title="Delete profile"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableShell>
      )}

      <ProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profile={editing}
        onSaved={() => void refresh()}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.label ?? "profile"}?`}
        description="The profile is removed from the list and its stored credential is deleted. Past sessions, switches, and rate-limit records stay in Activity."
        confirmLabel="Delete profile"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
