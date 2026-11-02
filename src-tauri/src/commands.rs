use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::flags::FeatureFlags;
use crate::process::{self, Session, SpawnOptions};
use crate::profiles::{self, CreateProfileInput, Profile};
use crate::projects::{self, CreateProjectInput, Project, UpdateProjectInput};
use crate::usage::{self, RecordUsageInput, UsageReading};
use crate::AppState;

/// Settings response returned to the frontend.
#[derive(Serialize)]
pub struct AppSettings {
    pub db_path: String,
    pub app_data_dir: String,
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

/// Tauri command: get latest usage reading for a profile.
#[tauri::command]
pub async fn get_profile_usage(
    state: State<'_, Arc<AppState>>,
    profile_id: String,
) -> Result<Option<UsageReading>, String> {
    usage::get_latest_usage(state.db.pool(), &profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: list latest usage reading for all profiles.
#[tauri::command]
pub async fn list_latest_usages(
    state: State<'_, Arc<AppState>>,
) -> Result<HashMap<String, UsageReading>, String> {
    usage::list_latest_usages(state.db.pool())
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: manually record or simulate a usage reading.
#[tauri::command]
pub async fn record_usage(
    state: State<'_, Arc<AppState>>,
    input: RecordUsageInput,
) -> Result<UsageReading, String> {
    usage::record_usage(state.db.pool(), input)
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
    pub custom_command: Option<String>,
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

    if let Some(ref proj_id) = input.project_id {
        if let Ok(Some(proj)) = projects::get_project(pool, proj_id).await {
            if resolved_path.is_none() {
                resolved_path = Some(PathBuf::from(proj.path));
            }
            if resolved_profile_id.is_none() {
                resolved_profile_id = proj.default_profile_id;
            }
        }
    }

    // 2. Resolve profile
    let profile_id = match resolved_profile_id {
        Some(id) => id,
        None => {
            let profiles = profiles::list_profiles(pool)
                .await
                .map_err(|e| e.to_string())?;
            if profiles.is_empty() {
                return Err("No profiles found. Please create a profile first.".to_string());
            }
            profiles[0].id.clone()
        }
    };

    let profile = profiles::get_profile(pool, &profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    // 3. Fetch credential if stored
    let secret = profiles::get_secret(&profile.id).map_err(|e| e.to_string())?;

    // 4. Prepare spawn options
    let opts = SpawnOptions {
        profile: &profile,
        project_path: resolved_path.as_deref(),
        project_id: input.project_id,
        secret: secret.as_deref(),
        custom_command: input.custom_command,
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

/// Tauri command: probe whether Windows Terminal (`wt.exe`) is available.
#[tauri::command]
pub fn check_terminal_available() -> Result<bool, String> {
    Ok(process::find_windows_terminal().is_some())
}
