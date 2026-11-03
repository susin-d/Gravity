import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../lib/api";
import type { Project, Tag, TerminalKind } from "../lib/types";
import { useAppData } from "../state/AppData";
import { useToast } from "./ui/toast";
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/field";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSaved: (project: Project) => void;
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: ProjectDialogProps) {
  const { profiles, settings, terminalAvailable } = useAppData();
  const { toast } = useToast();
  const editing = project != null;

  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState<Tag>("personal");
  const [defaultProfileId, setDefaultProfileId] = useState("");
  const [terminal, setTerminal] = useState<TerminalKind>("auto");
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setPath(project?.path ?? "");
    setName(project?.name ?? "");
    setTag(project?.tag ?? "personal");
    setDefaultProfileId(
      project?.default_profile_id &&
        profiles.some((profile) => profile.id === project.default_profile_id)
        ? project.default_profile_id
        : "",
    );
    setTerminal(project?.terminal ?? "auto");
    setAutoSwitch(project?.auto_switch_enabled === 1);
    setFormError(null);
  }, [open, project, profiles]);

  const autoSwitchFlag = settings?.flags.auto_switch === true;
  const clientProject = tag === "client";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = path.trim();
    const trimmedName = name.trim();

    if (!editing && !trimmedPath) {
      setFormError("Enter the project folder path.");
      return;
    }
    if (editing && !trimmedName) {
      setFormError("Enter a project name.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    let saved: Project;
    try {
      saved = project
        ? await api.updateProject(project.id, {
            name: trimmedName,
            tag,
            default_profile_id: defaultProfileId || null,
            terminal,
          })
        : await api.createProject({
            path: trimmedPath,
            name: trimmedName || null,
            tag,
            default_profile_id: defaultProfileId || null,
            terminal,
          });
    } catch (cause) {
      setFormError(errorMessage(cause));
      setSubmitting(false);
      return;
    }

    let autoSwitchWarning: string | null = null;
    const wasEnabled = project?.auto_switch_enabled === 1;
    const desiredAutoSwitch = clientProject ? false : autoSwitch;
    if ((autoSwitchFlag || clientProject) && desiredAutoSwitch !== wasEnabled) {
      try {
        await api.setProjectAutoSwitch(saved.id, desiredAutoSwitch);
      } catch (cause) {
        autoSwitchWarning = errorMessage(cause);
      }
    }

    setSubmitting(false);
    onOpenChange(false);
    onSaved(saved);

    if (autoSwitchWarning) {
      toast({
        variant: "error",
        title: "Project saved, but auto-switch was not changed",
        description: autoSwitchWarning,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Projects are folders you launch sessions in. The path is stored in the
            registry; Gravity never moves or deletes your files.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Field
              id="project-path"
              label="Folder path"
              hint={editing ? "Paths are fixed after registration." : "Example: C:\\Projects\\acme-app"}
            >
              <Input
                id="project-path"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="C:\\Projects\\acme-app"
                disabled={editing}
                autoFocus={!editing}
                className="font-mono text-xs"
                required={!editing}
              />
            </Field>

            <Field id="project-name" label="Name" hint="Shown throughout Gravity.">
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional in new projects — defaults to the folder name"
                autoFocus={editing}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="project-tag" label="Boundary tag">
                <Select
                  id="project-tag"
                  value={tag}
                  onChange={(event) => setTag(event.target.value as Tag)}
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="client">Client (guarded)</option>
                </Select>
              </Field>

              <Field id="project-default-profile" label="Default profile">
                <Select
                  id="project-default-profile"
                  value={defaultProfileId}
                  onChange={(event) => setDefaultProfileId(event.target.value)}
                >
                  <option value="">No default</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              id="project-terminal"
              label="Terminal"
              hint={
                terminalAvailable === false
                  ? "Windows Terminal was not detected. Auto falls back to PowerShell."
                  : "Auto prefers Windows Terminal and falls back to PowerShell."
              }
            >
              <Select
                id="project-terminal"
                value={terminal}
                onChange={(event) => setTerminal(event.target.value as TerminalKind)}
              >
                <option value="auto">Auto</option>
                <option value="wt">Windows Terminal</option>
                <option value="powershell">PowerShell</option>
                <option value="wsl" disabled>
                  WSL — planned
                </option>
              </Select>
            </Field>

            {autoSwitchFlag && (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-raised/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Auto-switch on rate limit</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {clientProject
                      ? "Client projects can never be auto-switched."
                      : "When a rate limit is reported, Gravity may start a new session with the most recently used eligible profile."}
                  </p>
                </div>
                <Switch
                  checked={clientProject ? false : autoSwitch}
                  onCheckedChange={setAutoSwitch}
                  disabled={clientProject}
                  aria-label="Enable auto-switch for this project"
                />
              </div>
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
              {editing ? "Save changes" : "Add project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
