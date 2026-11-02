use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use crate::flags::FeatureFlags;
use crate::process::{self, Session, SpawnOptions};
use crate::profiles::{self, CreateProfileInput, Profile};
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

/// Payload for spawning a new terminal session.
#[derive(Debug, Deserialize)]
pub struct SpawnSessionInput {
    pub profile_id: String,
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
    // 1. Fetch profile
    let profile = profiles::get_profile(state.db.pool(), &input.profile_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Profile not found: {}", input.profile_id))?;

    // 2. Fetch credential if stored
    let secret = profiles::get_secret(&profile.id)
        .map_err(|e| e.to_string())?;

    // 3. Prepare spawn options
    let project_path_buf = input.project_path.map(PathBuf::from);
    let opts = SpawnOptions {
        profile: &profile,
        project_path: project_path_buf.as_deref(),
        project_id: input.project_id,
        secret: secret.as_deref(),
        custom_command: input.custom_command,
    };

    // 4. Launch session
    process::spawn_session(state.db.pool(), &state.process_mgr, opts)
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
