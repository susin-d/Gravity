import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import {
  defaultPermissionMode,
  permissionModes,
} from "../../lib/chat";
import type {
  AdaptersHealthReport,
  Chat,
  Profile,
  Project,
  Vendor,
} from "../../lib/types";
import { tagLabel, vendorLabel } from "../../lib/format";
import type { PageId } from "../../lib/navigation";
import { Badge, tagBadgeVariant, vendorBadgeVariant } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Field, Select } from "../ui/field";
import { Switch } from "../ui/switch";

export interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  projects: Project[];
  capabilities: AdaptersHealthReport | null;
  onCreated: (chat: Chat) => void;
  onNavigate: (page: PageId) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  profiles,
  projects,
  capabilities,
  onCreated,
  onNavigate,
}: NewChatDialogProps) {
  const [profileId, setProfileId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [permissionMode, setPermissionMode] = useState("plan");
  const [carryContext, setCarryContext] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useMemo(
    () => profiles.find((candidate) => candidate.id === profileId) ?? null,
    [profiles, profileId],
  );
  const vendor: Vendor = profile?.vendor ?? "claude";
  const modes = permissionModes[vendor];
  const activeMode = modes.find((mode) => mode.value === permissionMode) ?? modes[0];

  useEffect(() => {
    if (!open) return;
    const first = profiles[0]?.id ?? "";
    setProfileId(first);
    setProjectId("");
    setPermissionMode(
      profiles[0] ? defaultPermissionMode(profiles[0].vendor) : "plan",
    );
    setCarryContext(true);
    setError(null);
  }, [open, profiles]);

  function handleProfileChange(nextId: string) {
    setProfileId(nextId);
    const next = profiles.find((candidate) => candidate.id === nextId);
    if (next) setPermissionMode(defaultPermissionMode(next.vendor));
  }

  async function handleCreate() {
    if (!profile) {
      setError("Choose a profile first.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const chat = await api.createChat({
        title: "New chat",
        vendor: profile.vendor,
        profile_id: profile.id,
        project_id: projectId || null,
        permission_mode: permissionMode,
        carry_context: carryContext,
      });
      onCreated(chat);
      onOpenChange(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  const capability =
    capabilities === null
      ? null
      : vendor === "claude"
        ? capabilities.claude_chat
        : capabilities.codex_chat;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-ink-muted" aria-hidden />
            New chat
          </DialogTitle>
          <DialogDescription>
            Each chat keeps its own transcript. Switching accounts later replays
            that transcript into the new account.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {profiles.length === 0 ? (
            <Banner
              variant="warning"
              title="No profiles yet"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onNavigate("profiles");
                  }}
                >
                  Open Profiles
                </Button>
              }
            >
              A chat needs a profile so Gravity knows which isolated config
              directory to use.
            </Banner>
          ) : (
            <>
              <Field id="chat-profile" label="Profile">
                <Select
                  id="chat-profile"
                  value={profileId}
                  onChange={(event) => handleProfileChange(event.target.value)}
                >
                  {profiles.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label} · {vendorLabel(candidate.vendor)}
                    </option>
                  ))}
                </Select>
              </Field>

              {profile && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={vendorBadgeVariant(profile.vendor)}>
                    {vendorLabel(profile.vendor)}
                  </Badge>
                  <Badge variant={tagBadgeVariant(profile.tag)}>
                    {tagLabel(profile.tag)}
                  </Badge>
                  {profile.tag === "client" && (
                    <span className="text-xs text-ink-dim">
                      Client accounts are never auto-switched.
                    </span>
                  )}
                </div>
              )}

              <Field
                id="chat-project"
                label="Project"
                hint="The CLI runs inside this folder. Chats without a project start in your home directory."
              >
                <Select
                  id="chat-project"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">Home directory</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                id="chat-permission"
                label="Permission mode"
                hint={activeMode.description}
              >
                <Select
                  id="chat-permission"
                  value={permissionMode}
                  onChange={(event) => setPermissionMode(event.target.value)}
                >
                  {modes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex items-start justify-between gap-3 rounded border border-line bg-raised/40 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">Carry context</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Replay this chat's transcript when Gravity has to start a new
                    vendor session, such as after an account switch.
                  </p>
                </div>
                <Switch
                  checked={carryContext}
                  onCheckedChange={setCarryContext}
                  aria-label="Carry context across account switches"
                />
              </div>

              {capability && !capability.available && (
                <Banner variant="warning" title="CLI not found">
                  {capability.detail}. Install the {vendorLabel(vendor)} CLI and
                  restart Gravity before sending a message.
                </Banner>
              )}

              {error && <p className="text-xs text-danger-text">{error}</p>}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={creating}
            disabled={profiles.length === 0}
            onClick={() => void handleCreate()}
          >
            Create chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
