use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use tracing::info;

use crate::flags::FeatureFlags;
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
