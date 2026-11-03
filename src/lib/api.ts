import { invoke } from "@tauri-apps/api/core";
import type {
  AdaptersHealthReport,
  AppSettings,
  Chat,
  ChatDetail,
  CreateChatInput,
  CreateProfileInput,
  CreateProjectInput,
  CredentialStatus,
  CliToolingStatus,
  LimitEvent,
  Profile,
  Project,
  ProviderAuthStatus,
  ReportRateLimitResult,
  Session,
  SpawnSessionInput,
  SwitchEvent,
  SwitchExecutionResult,
  UpdateChatInput,
  UpdateProfileInput,
  UpdateProjectInput,
  Vendor,
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
  removeProfileSecret: (profileId: string) =>
    invoke<void>("remove_profile_secret", { profileId }),
  probeProviderCli: (vendor: Vendor) =>
    invoke<CliToolingStatus>("probe_provider_cli", { vendor }),
  spawnProviderInstall: (vendor: Vendor) =>
    invoke<string>("spawn_provider_install", { vendor }),
  spawnProviderLogin: (profileId: string, method: "sign_in" | "device_auth") =>
    invoke<string>("spawn_provider_login", { profileId, method }),
  signInWithApiKey: (profileId: string, apiKey: string) =>
    invoke<ProviderAuthStatus>("sign_in_with_api_key", { profileId, apiKey }),
  providerAuthStatus: (profileId: string) =>
    invoke<ProviderAuthStatus>("provider_auth_status", { profileId }),
  signOutProvider: (profileId: string) =>
    invoke<ProviderAuthStatus>("sign_out_provider", { profileId }),

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

  listChats: () => invoke<Chat[]>("list_chats"),
  createChat: (input: CreateChatInput) => invoke<Chat>("create_chat", { input }),
  getChat: (chatId: string) => invoke<ChatDetail>("get_chat", { chatId }),
  updateChat: (chatId: string, input: UpdateChatInput) =>
    invoke<Chat>("update_chat", {
      chatId,
      title: input.title,
      permissionMode: input.permission_mode,
      carryContext: input.carry_context,
    }),
  deleteChat: (chatId: string) => invoke<void>("delete_chat", { chatId }),
  switchChatProfile: (chatId: string, toProfileId: string, clientConfirmed: boolean) =>
    invoke<Chat>("switch_chat_profile", {
      chatId,
      toProfileId,
      clientConfirmed,
    }),
  sendMessage: (input: { chat_id: string; content: string }) =>
    invoke<string>("send_message", { input }),
  cancelTurn: (turnId: string) => invoke<boolean>("cancel_turn", { turnId }),
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
