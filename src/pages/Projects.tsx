import { useState } from "react";
import { FolderKanban, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { Project } from "../lib/types";
import { tagLabel, terminalLabel } from "../lib/format";
import type { PageId } from "../lib/navigation";
import { useAppData } from "../state/AppData";
import { Badge, tagBadgeVariant } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { EmptyState } from "../components/ui/empty-state";
import { SkeletonRows } from "../components/ui/skeleton";
import { Switch } from "../components/ui/switch";
import { PageHeader } from "../components/layout/page-header";
import {
  Table,
  TableShell,
  tableHeadRow,
  tableRow,
  td,
  th,
} from "../components/ui/table";
import { useToast } from "../components/ui/toast";
import { ProjectDialog } from "../components/project-dialog";

export interface ProjectsPageProps {
  onNavigate: (page: PageId) => void;
}

export function ProjectsPage({ onNavigate }: ProjectsPageProps) {
  const {
    projects,
    profiles,
    settings,
    terminalAvailable,
    loading,
    refresh,
    setLaunchProject,
  } = useAppData();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const autoSwitchFlag = settings?.flags.auto_switch === true;

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
      toast({ variant: "success", title: "Project removed" });
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not remove the project",
        description: errorMessage(cause),
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleAutoSwitch(project: Project, enabled: boolean) {
    setTogglingId(project.id);
    try {
      await api.setProjectAutoSwitch(project.id, enabled);
      await refresh();
    } catch (cause) {
      toast({
        variant: "error",
        title: "Could not change auto-switch",
        description: errorMessage(cause),
      });
    } finally {
      setTogglingId(null);
    }
  }

  function handleLaunch(project: Project) {
    setLaunchProject(project.id);
    onNavigate("launch");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Register the folders you work in, assign a boundary tag, and choose how sessions open."
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
            Add project
          </Button>
        }
      />

      {loading && projects.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects registered"
          description="Add a folder to give sessions a working directory. Without projects, sessions start in your home directory."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Add project
            </Button>
          }
        />
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr className={tableHeadRow}>
                <th scope="col" className={th}>Project</th>
                <th scope="col" className={th}>Tag</th>
                <th scope="col" className={th}>Default profile</th>
                <th scope="col" className={th}>Terminal</th>
                {autoSwitchFlag && <th scope="col" className={th}>Auto-switch</th>}
                <th scope="col" className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const defaultProfile = project.default_profile_id
                  ? profiles.find(
                      (profile) => profile.id === project.default_profile_id,
                    )
                  : null;
                const missingDefault =
                  project.default_profile_id != null && defaultProfile == null;
                const terminalMissing =
                  project.terminal === "wt" && terminalAvailable === false;

                return (
                  <tr key={project.id} className={tableRow}>
                    <td className={td}>
                      <p className="font-medium text-ink">{project.name}</p>
                      <p
                        className="mt-0.5 max-w-[280px] truncate font-mono text-[11px] text-ink-dim"
                        title={project.path}
                      >
                        {project.path}
                      </p>
                    </td>
                    <td className={td}>
                      <Badge variant={tagBadgeVariant(project.tag)}>
                        {tagLabel(project.tag)}
                      </Badge>
                    </td>
                    <td className={td}>
                      {missingDefault ? (
                        <Badge variant="warning">Removed profile</Badge>
                      ) : (
                        <span className="text-ink-muted">
                          {defaultProfile?.label ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink-muted">
                          {terminalLabel(project.terminal)}
                        </span>
                        {terminalMissing && (
                          <Badge variant="warning">Not installed</Badge>
                        )}
                      </div>
                    </td>
                    {autoSwitchFlag && (
                      <td className={td}>
                        {project.tag === "client" ? (
                          <Badge variant="danger">Never</Badge>
                        ) : (
                          <Switch
                            checked={project.auto_switch_enabled === 1}
                            disabled={togglingId === project.id}
                            onCheckedChange={(enabled) =>
                              void handleToggleAutoSwitch(project, enabled)
                            }
                            aria-label={`Enable auto-switch for ${project.name}`}
                          />
                        )}
                      </td>
                    )}
                    <td className={td}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleLaunch(project)}
                          aria-label={`Launch in ${project.name}`}
                          title="Launch in this project"
                        >
                          <Rocket className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(project);
                            setDialogOpen(true);
                          }}
                          aria-label={`Edit ${project.name}`}
                          title="Edit project"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(project)}
                          aria-label={`Remove ${project.name}`}
                          title="Remove project"
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

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing}
        onSaved={() => void refresh()}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Remove ${deleteTarget?.name ?? "project"}?`}
        description="The folder stays on disk. Gravity only removes it from the project registry; past sessions remain in Activity."
        confirmLabel="Remove project"
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
