pub mod adapters;
pub mod auto_switch;
pub mod commands;
pub mod db;
pub mod flags;
pub mod process;
pub mod profiles;
pub mod projects;
pub mod redact;
pub mod single_instance;
pub mod switching;
pub mod usage;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::Manager;
use tracing::info;
use tracing_subscriber::EnvFilter;

use db::Db;
use flags::FeatureFlags;
use process::ProcessManager;

/// Shared application state accessible from Tauri commands.
pub struct AppState {
    pub db: Db,
    pub flags: FeatureFlags,
    pub app_data_dir: PathBuf,
    pub process_mgr: ProcessManager,
}

pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // Single instance check
    let _guard = match single_instance::acquire() {
        Ok(guard) => guard,
        Err(()) => {
            eprintln!("Another instance of Gravity is already running. Exiting.");
            std::process::exit(0);
        }
    };

    info!("Gravity v{} starting", env!("CARGO_PKG_VERSION"));

    // Determine app data directory (%APPDATA%\Gravity)
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Gravity");
    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

    info!("App data dir: {}", app_data_dir.display());

    // Load feature flags
    let flags = FeatureFlags::load(&app_data_dir);
    info!("Feature flags: {:?}", flags);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let app_data = app_data_dir.clone();
            let handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                match Db::open(&app_data).await {
                    Ok(db) => {
                        if let Err(e) = process::reconcile_stale_sessions(db.pool()).await {
                            tracing::error!("Failed to reconcile stale sessions: {e}");
                        }
                        let state = Arc::new(AppState {
                            db,
                            flags: FeatureFlags::load(&app_data),
                            app_data_dir: app_data,
                            process_mgr: ProcessManager::new(),
                        });
                        handle.manage(state);
                        info!("Database initialized and state registered");
                    }
                    Err(e) => {
                        tracing::error!("Failed to initialize database: {e}");
                    }
                }
            });

            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }

            info!("Setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_version,
            commands::get_settings,
            commands::create_profile,
            commands::list_profiles,
            commands::update_profile,
            commands::profile_credential_status,
            commands::delete_profile,
            commands::spawn_session,
            commands::list_sessions,
            commands::stop_session,
            commands::check_terminal_available,
            commands::create_project,
            commands::list_projects,
            commands::update_project,
            commands::set_project_auto_switch,
            commands::delete_project,
            commands::list_latest_usages,
            commands::refresh_profile_usage,
            commands::check_adapters_health,
            commands::list_limit_events,
            commands::report_rate_limit,
            commands::suggest_fallback_profile,
            commands::execute_profile_switch,
            commands::record_switch_cancellation,
            commands::list_switch_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gravity");
}
