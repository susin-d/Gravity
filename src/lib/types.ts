export type Vendor = "claude" | "codex";
export type Tag = "personal" | "work" | "client";
export type TerminalKind = "auto" | "wt" | "powershell";
export type SessionStatus = "running" | "ended" | "crashed" | "killed";
export type UsageSource = "official" | "estimated" | "unknown";
export type CredentialStatus = "stored" | "missing" | "unknown";
export type SignInStatus = "signed_in" | "signed_out" | "unknown";

export interface ProviderAuthStatus {
  status: SignInStatus;
  detail: string;
}

export interface CliToolingStatus {
  cli: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  npm_available: boolean;
  detail: string;
}
export type SwitchReason = "manual" | "limit" | "auto";
export type SwitchOutcome =
  | "completed"
  | "cancelled"
  | "confirmed_client_boundary"
  | "blocked_client_auto"
  | "no_eligible";

export interface Profile {
  id: string;
  label: string;
  vendor: Vendor;
  tag: Tag;
  config_dir: string;
  cred_ref: string;
  created_at: string;
  updated_at: string;
  is_active: number;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  tag: Tag;
  auto_switch_enabled: number;
  default_profile_id: string | null;
  terminal: TerminalKind;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  profile_id: string;
  project_id: string | null;
  pid: number | null;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  status: SessionStatus;
  origin: "terminal" | "chat";
}

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface Chat {
  id: string;
  title: string;
  vendor: Vendor;
  profile_id: string;
  project_id: string | null;
  permission_mode: string;
  carry_context: boolean;
  cli_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: ChatRole;
  content: string;
  meta: string | null;
  created_at: string;
}

export interface ChatDetail {
  chat: Chat;
  messages: ChatMessage[];
}

export interface ChatCapabilities {
  available: boolean;
  supports_stream: boolean;
  supports_permission_mode: boolean;
  supports_resume: boolean;
  detail: string;
}

export interface ChatToolRecord {
  name: string;
  summary: string;
}

export interface ChatUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
}

export interface ChatMessageMeta {
  profile_id: string;
  usage: ChatUsage | null;
  tools: ChatToolRecord[];
}

export interface ChatDeltaEvent {
  chat_id: string;
  turn_id: string;
  delta: string;
}

export interface ChatToolEvent {
  chat_id: string;
  turn_id: string;
  tools: ChatToolRecord[];
}

export interface ChatDoneEvent {
  chat_id: string;
  turn_id: string;
  usage: ChatUsage | null;
}

export interface ChatErrorEvent {
  chat_id: string;
  turn_id: string;
  error: string;
}

export interface ChatLimitEvent {
  chat_id: string;
  turn_id: string;
  raw_signal: string;
  detail: string;
}

export interface ChatSwitchEvent {
  chat_id: string;
  turn_id: string;
  from_profile_id: string;
  to_profile_id: string;
  detail: string;
}

export interface CreateChatInput {
  title: string;
  vendor: Vendor;
  profile_id: string;
  project_id: string | null;
  permission_mode: string;
  carry_context: boolean;
}

export interface UpdateChatInput {
  title?: string;
  permission_mode?: string;
  carry_context?: boolean;
}

export interface UsageReading {
  id: string;
  profile_id: string;
  source: UsageSource;
  window: string | null;
  value_used: number | null;
  value_limit: number | null;
  unit: string | null;
  reset_at: string | null;
  fetched_at: string;
  detail: string | null;
}

export interface SwitchEvent {
  id: string;
  session_id: string | null;
  from_profile_id: string;
  to_profile_id: string;
  project_id: string | null;
  reason: SwitchReason;
  outcome: SwitchOutcome;
  new_session_id: string | null;
  switched_at: string;
  detail: string | null;
}

export interface LimitEvent {
  id: string;
  session_id: string;
  profile_id: string;
  detected_at: string;
  source: string;
  raw_signal: string;
  detail: string | null;
}

export interface FeatureFlags {
  auto_switch: boolean;
}

export interface AppSettings {
  db_path: string;
  app_data_dir: string;
  flags_path: string;
  flags: FeatureFlags;
}

export interface AdapterHealth {
  status: "ok" | "degraded";
  detail: string;
}

export interface AdaptersHealthReport {
  claude: AdapterHealth;
  codex: AdapterHealth;
  claude_chat: ChatCapabilities;
  codex_chat: ChatCapabilities;
}

export interface SwitchExecutionResult {
  switch_event: SwitchEvent | null;
  new_session: Session | null;
  requires_client_confirmation: boolean;
  confirmation_message: string | null;
}

export interface ReportRateLimitResult {
  limit_event: LimitEvent;
  auto_switch: SwitchEvent | null;
}

export interface CreateProfileInput {
  label: string;
  vendor: Vendor;
  tag: Tag;
  secret: string | null;
}

export interface UpdateProfileInput {
  label: string;
  tag: Tag;
  secret: string | null;
  clear_secret: boolean;
}

export interface CreateProjectInput {
  path: string;
  name: string | null;
  tag: Tag;
  default_profile_id: string | null;
  terminal: TerminalKind;
}

export interface UpdateProjectInput {
  name: string;
  tag: Tag;
  default_profile_id: string | null;
  terminal: TerminalKind;
}

export interface SpawnSessionInput {
  profile_id: string | null;
  project_path: string | null;
  project_id: string | null;
  client_confirmed: boolean;
}
