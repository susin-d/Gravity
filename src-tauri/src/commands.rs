use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;
use uuid::Uuid;

use crate::adapters::{self, AdapterHealth, LimitEvent};
use crate::auto_switch;
use crate::flags::FeatureFlags;
use crate::process::{self, Session, SpawnOptions};
use crate::profiles::{self, CreateProfileInput, CredentialStatus, Profile, UpdateProfileInput};
use crate::projects::{self, CreateProjectInput, Project, UpdateProjectInput};
use crate::switching::{self, SwitchEvent, SwitchExecutionResult};
use crate::usage::{self, RecordUsageInput, UsageReading};
use crate::AppState;

/// Settings response returned to the frontend.
#[derive(Serialize)]
pub struct AppSettings {
    pub db_path: String,
    pub app_data_dir: String,
    pub flags_path: String,
    pub flags: FeatureFlags,
}

/// Tauri command: get application version.
#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Tauri command: get current settings for display.
#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> Result<AppSettings, String> {
    info!("get_settings called");
    Ok(AppSettings {
        db_path: state
            .app_data_dir
            .join("gravity.db")
            .to_string_lossy()
            .to_string(),
        app_data_dir: state.app_data_dir.to_string_lossy().to_string(),
        flags_path: state
            .app_data_dir
            .join("flags.toml")
            .to_string_lossy()
            .to_string(),
        flags: state.flags.clone(),
    })
}

// ==========================================
// Profile Commands
// ==========================================

/// Tauri command: create a new profile.
#[tauri::command]
pub async fn create_profile(
    state: State<'_, Arc<AppState>>,
    input: CreateProfileInput,
) -> Result<Profile, String> {
    profiles::create_profile(state.db.pool(), &state.app_data_dir, input)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: list all active profiles.
#[tauri::command]
pub async fn list_profiles(state: State<'_, Arc<AppState>>) -> Result<Vec<Profile>, String> {
    profiles::list_profiles(state.db.pool())
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: soft-delete a profile and clean up its credential.
#[tauri::command]
pub async fn delete_profile(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    profiles::delete_profile(state.db.pool(), &id)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: update a profile's label, tag, or credential.
#[tauri::command]
pub async fn update_profile(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: UpdateProfileInput,
) -> Result<Profile, String> {
    profiles::update_profile(state.db.pool(), &id, input)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: report whether a profile has a stored credential.
#[tauri::command]
pub fn profile_credential_status(profile_id: String) -> CredentialStatus {
    profiles::credential_status(&profile_id)
}

// ==========================================
// Project Commands (M2)
// ==========================================

/// Tauri command: register a new project.
#[tauri::command]
pub async fn create_project(
    state: State<'_, Arc<AppState>>,
    input: CreateProjectInput,
) -> Result<Project, String> {
    projects::create_project(state.db.pool(), input)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: list all registered projects.
#[tauri::command]
pub async fn list_projects(state: State<'_, Arc<AppState>>) -> Result<Vec<Project>, String> {
    projects::list_projects(state.db.pool())
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: update project details.
#[tauri::command]
pub async fn update_project(
    state: State<'_, Arc<AppState>>,
    id: String,
    input: UpdateProjectInput,
) -> Result<Project, String> {
    projects::update_project(state.db.pool(), &id, input)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: set project auto-switch policy.
#[tauri::command]
pub async fn set_project_auto_switch(
    state: State<'_, Arc<AppState>>,
    project_id: String,
    enabled: bool,
) -> Result<(), String> {
    projects::set_auto_switch(state.db.pool(), &project_id, enabled, &state.flags)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: unregister a project.
#[tauri::command]
pub async fn delete_project(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    projects::delete_project(state.db.pool(), &id)
        .await
        .map_err(|e| e.to_string())
}

// ==========================================
// Usage Telemetry Commands (M3)
// ==========================================

/// Tauri command: list latest usage reading for all profiles.
#[tauri::command]
pub async fn list_latest_usages(
    state: State<'_, Arc<AppState>>,
) -> Result<HashMap<String, UsageReading>, String> {
    usage::list_latest_usages(state.db.pool())
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: ask the profile's adapter for a fresh reading and persist it.
#[tauri::command]
pub async fn refresh_profile_usage(
    state: State<'_, Arc<AppState>>,
    profile_id: String,
) -> Result<UsageReading, String> {
    let profile = profiles::get_profile(state.db.pool(), &profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    let adapter = adapters::get_adapter_for_vendor(&profile.vendor)
        .ok_or_else(|| format!("No adapter for vendor: {}", profile.vendor))?;
    let reading = adapter.read_usage(&profile);

    usage::record_usage(
        state.db.pool(),
        RecordUsageInput {
            profile_id: reading.profile_id,
            source: reading.source,
            window: reading.window,
            value_used: reading.value_used,
            value_limit: reading.value_limit,
            unit: reading.unit,
            reset_at: reading.reset_at,
            detail: reading.detail,
        },
    )
    .await
    .map_err(|e| e.to_string())
}

// ==========================================
// Provider Adapters & Limit Detection (M4)
// ==========================================

/// Health report returned for all provider adapters.
#[derive(Serialize)]
pub struct AdaptersHealthReport {
    pub claude: AdapterHealth,
    pub codex: AdapterHealth,
    pub claude_chat: adapters::ChatCapabilities,
    pub codex_chat: adapters::ChatCapabilities,
}

/// Tauri command: probe the Claude and Codex CLIs on this machine.
#[tauri::command]
pub fn check_adapters_health() -> Result<AdaptersHealthReport, String> {
    let claude = adapters::claude::ClaudeAdapter::new();
    let codex = adapters::codex::CodexAdapter::new();

    Ok(AdaptersHealthReport {
        claude: adapters::ProviderAdapter::health(&claude),
        codex: adapters::ProviderAdapter::health(&codex),
        claude_chat: adapters::probe_chat_capabilities("claude"),
        codex_chat: adapters::probe_chat_capabilities("codex"),
    })
}

/// Tauri command: list recorded rate limit events.
#[tauri::command]
pub async fn list_limit_events(
    state: State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<Vec<LimitEvent>, String> {
    adapters::list_limit_events(state.db.pool(), limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

/// Result of a user-reported rate limit.
#[derive(Serialize)]
pub struct ReportRateLimitResult {
    pub limit_event: LimitEvent,
    pub auto_switch: Option<SwitchEvent>,
}

/// Tauri command: record a user-reported rate limit and run auto-switch when the
/// feature flag and project policy allow it.
#[tauri::command]
pub async fn report_rate_limit(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<ReportRateLimitResult, String> {
    let session = process::get_session(state.db.pool(), &session_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    if session.status != "running" {
        return Err(format!(
            "Session {} is already {}; rate limits apply to running sessions",
            session_id, session.status
        ));
    }

    let limit_event = adapters::record_limit_event(
        state.db.pool(),
        &session_id,
        &session.profile_id,
        "manual",
        "User reported a rate limit",
        Some("Reported from the Gravity session list"),
    )
    .await
    .map_err(|e| e.to_string())?;

    let auto_switch = auto_switch::maybe_auto_switch(
        state.db.pool(),
        &state.process_mgr,
        &session_id,
        &state.flags,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(ReportRateLimitResult {
        limit_event,
        auto_switch,
    })
}

// ==========================================
// Profile Switching Engine (M5)
// ==========================================

/// Tauri command: suggest MRU non-client fallback profile for the same vendor.
#[tauri::command]
pub async fn suggest_fallback_profile(
    state: State<'_, Arc<AppState>>,
    from_profile_id: String,
) -> Result<Option<Profile>, String> {
    switching::suggest_switch(state.db.pool(), &from_profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: execute a profile switch.
#[tauri::command]
pub async fn execute_profile_switch(
    state: State<'_, Arc<AppState>>,
    session_id: Option<String>,
    from_profile_id: String,
    to_profile_id: String,
    project_id: Option<String>,
    reason: String,
    client_confirmed: bool,
) -> Result<SwitchExecutionResult, String> {
    switching::execute_switch(
        state.db.pool(),
        &state.process_mgr,
        session_id.as_deref(),
        &from_profile_id,
        &to_profile_id,
        project_id.as_deref(),
        &reason,
        client_confirmed,
    )
    .await
    .map_err(|e| e.to_string())
}

/// Tauri command: record switch cancellation (AC-07, AC-11).
#[tauri::command]
pub async fn record_switch_cancellation(
    state: State<'_, Arc<AppState>>,
    session_id: Option<String>,
    from_profile_id: String,
    to_profile_id: String,
    project_id: Option<String>,
    reason: String,
    detail: String,
) -> Result<SwitchEvent, String> {
    switching::record_cancellation(
        state.db.pool(),
        session_id.as_deref(),
        &from_profile_id,
        &to_profile_id,
        project_id.as_deref(),
        &reason,
        &detail,
    )
    .await
    .map_err(|e| e.to_string())
}

/// Tauri command: list recorded switch events.
#[tauri::command]
pub async fn list_switch_events(
    state: State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<Vec<SwitchEvent>, String> {
    switching::list_switch_events(state.db.pool(), limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

// ==========================================
// Session & Process Commands
// ==========================================

/// Payload for spawning a new terminal session.
#[derive(Debug, Deserialize)]
pub struct SpawnSessionInput {
    pub profile_id: Option<String>,
    pub project_path: Option<String>,
    pub project_id: Option<String>,
    #[serde(default)]
    pub client_confirmed: bool,
}

/// Tauri command: spawn an isolated CLI session bound to a Win32 Job Object.
#[tauri::command]
pub async fn spawn_session(
    state: State<'_, Arc<AppState>>,
    input: SpawnSessionInput,
) -> Result<Session, String> {
    let pool = state.db.pool();

    // 1. Resolve project details if project_id is provided
    let mut resolved_path = input.project_path.map(PathBuf::from);
    let mut resolved_profile_id = input.profile_id.clone();
    let mut resolved_terminal: Option<String> = None;

    if let Some(ref proj_id) = input.project_id {
        let proj = projects::get_project(pool, proj_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Project not found: {}", proj_id))?;

        if resolved_path.is_none() {
            resolved_path = Some(PathBuf::from(&proj.path));
        }
        if resolved_profile_id.is_none() {
            resolved_profile_id = proj.default_profile_id.clone();
        }
        resolved_terminal = Some(proj.terminal);
    }

    // 2. Resolve profile
    let profile_id = resolved_profile_id
        .ok_or_else(|| "Select a profile before launching a session".to_string())?;

    let profile = profiles::get_profile(pool, &profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    if profile.tag == "client" && !input.client_confirmed {
        return Err("Client boundary confirmation required for this profile".to_string());
    }

    // 3. Fetch credential if stored
    let secret = profiles::get_secret(&profile.id).map_err(|e| e.to_string())?;

    // 4. Prepare spawn options
    let opts = SpawnOptions {
        profile: &profile,
        project_path: resolved_path.as_deref(),
        project_id: input.project_id,
        terminal: resolved_terminal.as_deref(),
        secret: secret.as_deref(),
    };

    // 5. Launch session
    process::spawn_session(pool, &state.process_mgr, opts)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: list recent terminal sessions.
#[tauri::command]
pub async fn list_sessions(state: State<'_, Arc<AppState>>) -> Result<Vec<Session>, String> {
    process::list_sessions(state.db.pool())
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: terminate a session's Job Object and mark it killed.
#[tauri::command]
pub async fn stop_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Session, String> {
    process::stop_session(state.db.pool(), &state.process_mgr, &session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: probe whether Windows Terminal (`wt.exe`) is available.
#[tauri::command]
pub fn check_terminal_available() -> Result<bool, String> {
    Ok(process::find_windows_terminal().is_some())
}

// ==========================================
// Chat Commands
// ==========================================

/// Payload for creating a new chat.
#[derive(Debug, Deserialize)]
pub struct CreateChatInput {
    pub title: String,
    pub vendor: String,
    pub profile_id: String,
    pub project_id: Option<String>,
    pub permission_mode: String,
    #[serde(default)]
    pub carry_context: bool,
}

/// Payload for sending a message in a chat.
#[derive(Debug, Deserialize)]
pub struct SendMessageInput {
    pub chat_id: String,
    pub content: String,
}

/// Tauri command: create a new chat.
#[tauri::command]
pub async fn create_chat(
    state: State<'_, Arc<AppState>>,
    input: CreateChatInput,
) -> Result<crate::chat::Chat, String> {
    let pool = state.db.pool();

    // Validate permission mode
    crate::chat::validate_permission_mode(&input.vendor, &input.permission_mode)
        .map_err(|e| e.to_string())?;

    // Verify profile exists and matches vendor
    let profile = profiles::get_profile(pool, &input.profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Profile not found: {}", input.profile_id))?;

    if profile.vendor != input.vendor {
        return Err(format!(
            "Profile vendor '{}' does not match chat vendor '{}'",
            profile.vendor, input.vendor
        ));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let carry_context: i64 = if input.carry_context { 1 } else { 0 };

    sqlx::query(
        r#"
        INSERT INTO chats (id, title, vendor, profile_id, project_id, permission_mode, carry_context, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        "#,
    )
    .bind(&id)
    .bind(&input.title)
    .bind(&input.vendor)
    .bind(&input.profile_id)
    .bind(&input.project_id)
    .bind(&input.permission_mode)
    .bind(carry_context)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(crate::chat::Chat {
        id,
        title: input.title,
        vendor: input.vendor,
        profile_id: input.profile_id,
        project_id: input.project_id,
        permission_mode: input.permission_mode,
        carry_context: input.carry_context,
        cli_session_id: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Tauri command: list all chats.
#[tauri::command]
pub async fn list_chats(state: State<'_, Arc<AppState>>) -> Result<Vec<crate::chat::Chat>, String> {
    crate::chat::Chat::list(state.db.pool())
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: get a chat with its messages.
#[tauri::command]
pub async fn get_chat(
    state: State<'_, Arc<AppState>>,
    chat_id: String,
) -> Result<crate::chat::ChatDetail, String> {
    let pool = state.db.pool();

    let chat = crate::chat::Chat::load(pool, &chat_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Chat not found: {chat_id}"))?;

    let messages = crate::chat::ChatMessage::list(pool, &chat_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(crate::chat::ChatDetail { chat, messages })
}

/// Tauri command: send a user message in a chat and start a turn.
///
/// Returns the turn id immediately; output arrives through the `chat:*` events.
#[tauri::command]
pub async fn send_message(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    input: SendMessageInput,
) -> Result<String, String> {
    use tauri::Emitter;

    let pool = state.db.pool().clone();
    let content = input.content.trim().to_string();
    if content.is_empty() {
        return Err("Message is empty".to_string());
    }

    let chat = crate::chat::Chat::load(&pool, &input.chat_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Chat not found: {}", input.chat_id))?;

    let profile = profiles::get_profile(&pool, &chat.profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Profile not found: {}", chat.profile_id))?;

    let history = crate::chat::ChatMessage::list(&pool, &chat.id)
        .await
        .map_err(|e| e.to_string())?;
    let first_message = !history.iter().any(|message| message.role == "assistant");

    crate::chat::append_message(
        &pool,
        &crate::chat::AppendMessage {
            chat_id: chat.id.clone(),
            role: "user".to_string(),
            content: content.clone(),
            meta: None,
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    let turn_id = Uuid::new_v4().to_string();
    let app_handle = app.clone();
    let state = state.inner().clone();
    let chat_id = chat.id.clone();
    let task_turn_id = turn_id.clone();

    tauri::async_runtime::spawn(async move {
        let turn_id = task_turn_id;
        let pool = state.db.pool().clone();
        let project_path = match chat.project_id.as_deref() {
            Some(project_id) => projects::get_project(&pool, project_id)
                .await
                .ok()
                .flatten()
                .map(|project| project.path),
            None => None,
        };

        let mut current_profile = profile;
        let mut resume = chat.cli_session_id.clone();
        let mut prompt = build_prompt(&chat, &history, resume.is_some(), &content);
        let mut tried = vec![current_profile.id.clone()];

        loop {
            let session_id =
                match start_chat_session(&pool, &current_profile.id, chat.project_id.as_deref())
                    .await
                {
                    Ok(id) => id,
                    Err(error) => {
                        emit_error(&app_handle, &chat_id, &turn_id, &error.to_string());
                        return;
                    }
                };

            let request = crate::chat::runner::TurnRequest {
                profile: current_profile.clone(),
                prompt: prompt.clone(),
                resume: resume.clone(),
                permission_mode: chat.permission_mode.clone(),
                project_path: project_path.clone(),
            };

            let outcome =
                crate::chat::runner::run_turn(&state.process_mgr, &turn_id, &request, |event| {
                    emit_stream(&app_handle, &chat_id, &turn_id, event)
                })
                .await;

            let outcome = match outcome {
                Ok(outcome) => outcome,
                Err(error) => {
                    finish_chat_session(&pool, &session_id, "crashed");
                    emit_error(&app_handle, &chat_id, &turn_id, &error.to_string());
                    return;
                }
            };

            if outcome.cancelled {
                finish_chat_session(&pool, &session_id, "killed");
                let _ = app_handle.emit(
                    "chat:done",
                    crate::chat::ChatDoneEvent {
                        chat_id: chat_id.clone(),
                        turn_id: turn_id.clone(),
                        usage: None,
                    },
                );
                return;
            }

            if let Some(limit) = outcome.limit.clone() {
                finish_chat_session(&pool, &session_id, "ended");
                if let Err(error) = adapters::record_limit_event(
                    &pool,
                    &session_id,
                    &current_profile.id,
                    "stdout",
                    &limit.raw_signal,
                    Some(&limit.detail),
                )
                .await
                {
                    emit_error(&app_handle, &chat_id, &turn_id, &error.to_string());
                    return;
                }

                if !state.flags.auto_switch {
                    emit_error(
                        &app_handle,
                        &chat_id,
                        &turn_id,
                        "Rate limit reached. Auto-switch is disabled in flags.toml.",
                    );
                    return;
                }

                if current_profile.tag == "client" {
                    emit_error(
                        &app_handle,
                        &chat_id,
                        &turn_id,
                        "Rate limit reached on a client account. Gravity never auto-switches client accounts.",
                    );
                    return;
                }

                let candidates = match switching::switch_candidates(
                    &pool,
                    &current_profile.vendor,
                    &tried,
                )
                .await
                {
                    Ok(candidates) => candidates,
                    Err(error) => {
                        emit_error(&app_handle, &chat_id, &turn_id, &error.to_string());
                        return;
                    }
                };

                let Some(target) = candidates.into_iter().next() else {
                    emit_error(
                        &app_handle,
                        &chat_id,
                        &turn_id,
                        "Rate limit reached and no other eligible account is available.",
                    );
                    return;
                };

                if let Err(error) = apply_limit_switch(
                    &app_handle,
                    &pool,
                    &chat,
                    &turn_id,
                    &session_id,
                    &current_profile,
                    &target,
                )
                .await
                {
                    emit_error(&app_handle, &chat_id, &turn_id, &error.to_string());
                    return;
                }

                tried.push(target.id.clone());
                current_profile = target;
                resume = None;
                prompt = build_prompt(&chat, &history, false, &content);
                continue;
            }

            finish_chat_session(&pool, &session_id, "ended");

            if outcome.text.trim().is_empty() {
                emit_error(
                    &app_handle,
                    &chat_id,
                    &turn_id,
                    "The CLI finished without returning a message.",
                );
                return;
            }

            if let Err(error) = persist_turn(
                &pool,
                &chat,
                &current_profile,
                &outcome,
                first_message,
                &content,
            )
            .await
            {
                emit_error(&app_handle, &chat_id, &turn_id, &error.to_string());
                return;
            }

            let _ = app_handle.emit(
                "chat:done",
                crate::chat::ChatDoneEvent {
                    chat_id: chat_id.clone(),
                    turn_id: turn_id.clone(),
                    usage: outcome.usage,
                },
            );
            return;
        }
    });

    Ok(turn_id)
}

/// Cancel a running chat turn by killing its process tree.
#[tauri::command]
pub fn cancel_turn(state: State<'_, Arc<AppState>>, turn_id: String) -> bool {
    state.process_mgr.cancel(&turn_id)
}

/// Tauri command: delete a chat and its messages.
#[tauri::command]
pub async fn delete_chat(state: State<'_, Arc<AppState>>, chat_id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM chats WHERE id = ?1")
        .bind(&chat_id)
        .execute(state.db.pool())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn emit_stream(
    app: &tauri::AppHandle,
    chat_id: &str,
    turn_id: &str,
    event: crate::chat::ChatStreamEvent,
) {
    use tauri::Emitter;

    match event {
        crate::chat::ChatStreamEvent::Delta(delta) => {
            let _ = app.emit(
                "chat:delta",
                crate::chat::ChatDeltaEvent {
                    chat_id: chat_id.to_string(),
                    turn_id: turn_id.to_string(),
                    delta,
                },
            );
        }
        crate::chat::ChatStreamEvent::Tools(tools) => {
            let _ = app.emit(
                "chat:tool",
                crate::chat::ChatToolEvent {
                    chat_id: chat_id.to_string(),
                    turn_id: turn_id.to_string(),
                    tools,
                },
            );
        }
        crate::chat::ChatStreamEvent::Limit(limit) => {
            let _ = app.emit(
                "chat:limit",
                crate::chat::ChatLimitEvent {
                    chat_id: chat_id.to_string(),
                    turn_id: turn_id.to_string(),
                    raw_signal: limit.raw_signal,
                    detail: limit.detail,
                },
            );
        }
    }
}

fn emit_error(app: &tauri::AppHandle, chat_id: &str, turn_id: &str, error: &str) {
    use tauri::Emitter;

    let _ = app.emit(
        "chat:error",
        crate::chat::ChatErrorEvent {
            chat_id: chat_id.to_string(),
            turn_id: turn_id.to_string(),
            error: error.to_string(),
        },
    );
}

/// Compose what the CLI receives. A live vendor session only needs the new
/// message; a switched or resumed-elsewhere chat needs the replayed transcript.
fn build_prompt(
    chat: &crate::chat::Chat,
    history: &[crate::chat::ChatMessage],
    resuming: bool,
    content: &str,
) -> String {
    if resuming {
        return content.to_string();
    }

    match crate::chat::handoff::build_handoff(history, chat.carry_context) {
        Some(handoff) => format!("{}\n\nUser: {}", handoff.text, content),
        None => content.to_string(),
    }
}

async fn apply_limit_switch(
    app: &tauri::AppHandle,
    pool: &sqlx::SqlitePool,
    chat: &crate::chat::Chat,
    turn_id: &str,
    session_id: &str,
    from: &Profile,
    to: &Profile,
) -> anyhow::Result<()> {
    use tauri::Emitter;

    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    sqlx::query(
        "UPDATE chats SET profile_id = ?1, cli_session_id = NULL, updated_at = ?2 WHERE id = ?3",
    )
    .bind(&to.id)
    .bind(&now)
    .bind(&chat.id)
    .execute(pool)
    .await?;

    let detail = format!("Rate limit switched from {} to {}", from.label, to.label);
    switching::record_switch_event(
        pool,
        Some(session_id),
        &from.id,
        &to.id,
        chat.project_id.as_deref(),
        "limit",
        "completed",
        None,
        Some(&detail),
    )
    .await?;

    app.emit(
        "chat:switch",
        crate::chat::ChatSwitchEvent {
            chat_id: chat.id.clone(),
            turn_id: turn_id.to_string(),
            from_profile_id: from.id.clone(),
            to_profile_id: to.id.clone(),
            detail,
        },
    )
    .map_err(|error| anyhow::anyhow!("Failed to emit chat:switch: {error}"))?;

    Ok(())
}

async fn persist_turn(
    pool: &sqlx::SqlitePool,
    chat: &crate::chat::Chat,
    profile: &Profile,
    outcome: &crate::chat::runner::TurnOutcome,
    first_message: bool,
    content: &str,
) -> anyhow::Result<()> {
    let meta = serde_json::json!({
        "profile_id": profile.id,
        "usage": outcome.usage,
        "tools": outcome.tools,
    });

    crate::chat::append_message(
        pool,
        &crate::chat::AppendMessage {
            chat_id: chat.id.clone(),
            role: "assistant".to_string(),
            content: outcome.text.clone(),
            meta: Some(meta.to_string()),
        },
    )
    .await?;

    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    sqlx::query("UPDATE chats SET cli_session_id = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(&outcome.session_id)
        .bind(&now)
        .bind(&chat.id)
        .execute(pool)
        .await?;

    if first_message {
        sqlx::query("UPDATE chats SET title = ?1 WHERE id = ?2")
            .bind(crate::chat::title_from_prompt(content))
            .bind(&chat.id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

/// Open an audit row for one chat turn. `limit_events` and `switch_events`
/// reference sessions, so every attempt needs one before it can be recorded.
async fn start_chat_session(
    pool: &sqlx::SqlitePool,
    profile_id: &str,
    project_id: Option<&str>,
) -> anyhow::Result<String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    sqlx::query(
        r#"
        INSERT INTO sessions (id, profile_id, project_id, pid, started_at, status, origin)
        VALUES (?1, ?2, ?3, NULL, ?4, 'running', 'chat')
        "#,
    )
    .bind(&id)
    .bind(profile_id)
    .bind(project_id)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(id)
}

fn finish_chat_session(pool: &sqlx::SqlitePool, session_id: &str, status: &'static str) {
    let pool = pool.clone();
    let session_id = session_id.to_string();
    tauri::async_runtime::spawn(async move {
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        if let Err(error) =
            sqlx::query("UPDATE sessions SET status = ?1, ended_at = ?2 WHERE id = ?3")
                .bind(status)
                .bind(&now)
                .bind(&session_id)
                .execute(&pool)
                .await
        {
            // A stale "running" row is repaired by reconcile_stale_sessions on
            // the next start, so this must not fail an otherwise good turn.
            tracing::warn!("Failed to close chat session {session_id}: {error}");
        }
    });
}

/// Tauri command: update a chat's metadata.
#[tauri::command]
pub async fn update_chat(
    state: State<'_, Arc<AppState>>,
    chat_id: String,
    title: Option<String>,
    permission_mode: Option<String>,
    carry_context: Option<bool>,
) -> Result<crate::chat::Chat, String> {
    let pool = state.db.pool();

    let existing = crate::chat::Chat::load(pool, &chat_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Chat not found: {chat_id}"))?;

    if let Some(ref mode) = permission_mode {
        crate::chat::validate_permission_mode(&existing.vendor, mode).map_err(|e| e.to_string())?;
    }

    sqlx::query(
        r#"
        UPDATE chats SET
            title           = COALESCE(?1, title),
            permission_mode = COALESCE(?2, permission_mode),
            carry_context   = COALESCE(?3, carry_context),
            updated_at      = ?4
        WHERE id = ?5
        "#,
    )
    .bind(title)
    .bind(permission_mode)
    .bind(carry_context.map(|value| if value { 1 } else { 0 }))
    .bind(Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    .bind(&chat_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    crate::chat::Chat::load(pool, &chat_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Chat not found: {chat_id}"))
}

/// Tauri command: switch a chat to another account of the same vendor.
///
/// The vendor session id is cleared because it belongs to the old account's
/// config directory; the next turn replays Gravity's transcript instead.
#[tauri::command]
pub async fn switch_chat_profile(
    state: State<'_, Arc<AppState>>,
    chat_id: String,
    to_profile_id: String,
    client_confirmed: bool,
) -> Result<crate::chat::Chat, String> {
    let pool = state.db.pool();

    let chat = crate::chat::Chat::load(pool, &chat_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Chat not found: {chat_id}"))?;

    let target = profiles::get_profile(pool, &to_profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Profile not found: {to_profile_id}"))?;

    if target.vendor != chat.vendor {
        return Err(format!(
            "Cannot switch a {} chat to a {} profile. Start a new chat instead.",
            chat.vendor, target.vendor
        ));
    }
    if target.id == chat.profile_id {
        return Ok(chat);
    }
    if target.tag == "client" && !client_confirmed {
        return Err("Client boundary confirmation required for this profile".to_string());
    }

    let outcome = if target.tag == "client" {
        "confirmed_client_boundary"
    } else {
        "completed"
    };

    sqlx::query(
        "UPDATE chats SET profile_id = ?1, cli_session_id = NULL, updated_at = ?2 WHERE id = ?3",
    )
    .bind(&target.id)
    .bind(Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    .bind(&chat.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    switching::record_switch_event(
        pool,
        None,
        &chat.profile_id,
        &target.id,
        chat.project_id.as_deref(),
        "manual",
        outcome,
        None,
        Some(&format!("Chat switched to {}", target.label)),
    )
    .await
    .map_err(|e| e.to_string())?;

    crate::chat::Chat::load(pool, &chat_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Chat not found: {chat_id}"))
}
