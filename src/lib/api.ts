import { invoke } from "@tauri-apps/api/core";
import type {
  AdaptersHealthReport,
  AppSettings,
  CreateProfileInput,
  CreateProjectInput,
  CredentialStatus,
  LimitEvent,
  Profile,
  Project,
  ReportRateLimitResult,
  Session,
  SpawnSessionInput,
  SwitchEvent,
  SwitchExecutionResult,
  UpdateProfileInput,
  UpdateProjectInput,
  UsageReading,
} from "./types";

export const api = {
  getVersion: () => invoke<string>("get_version"),
  getSettings: () => invoke<AppSettings>("get_settings"),
  checkTerminalAvailable: () => invoke<boolean>("check_terminal_available"),
  checkAdaptersHealth: () => invoke<AdaptersHealthReport>("check_adapters_health"),

  listProfiles: () => invoke<Profile[]>("list_profiles"),
  createProfile: (input: CreateProfileInput) =>
    invoke<Profile>("create_profile", { input }),
  updateProfile: (id: string, input: UpdateProfileInput) =>
    invoke<Profile>("update_profile", { id, input }),
  deleteProfile: (id: string) => invoke<void>("delete_profile", { id }),
  profileCredentialStatus: (profileId: string) =>
    invoke<CredentialStatus>("profile_credential_status", { profileId }),

  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (input: CreateProjectInput) =>
    invoke<Project>("create_project", { input }),
  updateProject: (id: string, input: UpdateProjectInput) =>
    invoke<Project>("update_project", { id, input }),
  setProjectAutoSwitch: (projectId: string, enabled: boolean) =>
    invoke<void>("set_project_auto_switch", { projectId, enabled }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),

  listSessions: () => invoke<Session[]>("list_sessions"),
  spawnSession: (input: SpawnSessionInput) =>
    invoke<Session>("spawn_session", { input }),
  stopSession: (sessionId: string) =>
    invoke<Session>("stop_session", { sessionId }),

  listLatestUsages: () =>
    invoke<Record<string, UsageReading>>("list_latest_usages"),
  refreshProfileUsage: (profileId: string) =>
    invoke<UsageReading>("refresh_profile_usage", { profileId }),

  listLimitEvents: (limit = 200) =>
    invoke<LimitEvent[]>("list_limit_events", { limit }),
  reportRateLimit: (sessionId: string) =>
    invoke<ReportRateLimitResult>("report_rate_limit", { sessionId }),

  listSwitchEvents: (limit = 200) =>
    invoke<SwitchEvent[]>("list_switch_events", { limit }),
  suggestFallbackProfile: (fromProfileId: string) =>
    invoke<Profile | null>("suggest_fallback_profile", { fromProfileId }),
  executeProfileSwitch: (input: {
    sessionId: string | null;
    fromProfileId: string;
    toProfileId: string;
    projectId: string | null;
    reason: "manual" | "limit" | "auto";
    clientConfirmed: boolean;
  }) => invoke<SwitchExecutionResult>("execute_profile_switch", input),
  recordSwitchCancellation: (input: {
    sessionId: string | null;
    fromProfileId: string;
    toProfileId: string;
    projectId: string | null;
    reason: "manual" | "limit" | "auto";
    detail: string;
  }) => invoke<SwitchEvent>("record_switch_cancellation", input),
};

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
  );
}
