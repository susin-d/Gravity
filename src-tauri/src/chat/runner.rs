use std::sync::Arc;

use chrono::Utc;
use tracing::info;
use uuid::Uuid;

use crate::process::OwnedJobObject;
use crate::chat::append_message;
use crate::adapters::ProviderAdapter;
use crate::flags::FeatureFlags;
use crate::usage::RecordUsageInput;
use crate::db::Db;
use crate::profiles::get_secret;
use crate::projects;
use crate::switching::{self, SwitchReason, SwitchOutcome};

/// Spawn and stream one chat turn for the given profile.
pub async fn spawn_turn(
    pool: &sqlx::SqlitePool,
    db: &Db,
    profile: &crate::profiles::Profile,
    project: Option<&crate::projects::Project>,
    flags: &FeatureFlags,
    mut input: impl FnMut(String),
) -> anyhow::Result<Option<(RecordUsageInput, Option<crate::chat::ParsedChunk>)>> {
    let env_map: std::collections::HashMap<String, String> =
        crate::profiles::build_env_block(profile, None).into_iter().collect();

    let session_id = Uuid::new_v4().to_string();
    let turn_id = Uuid::new_v4().to_string();

    let project_path = project.map(|p| p.path.clone());
    let target_dir: String = if let Some(dir) = &project_path {
        dir.clone()
    } else {
        dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    };

    // Create job object + spawn process
    let job = Arc::new(
        crate::process::OwnedJobObject::new()
            .map_err(|e| anyhow::anyhow!("Failed to create Job Object: {e}"))?,
    );

    let cli_cmd = match profile.vendor.as_str() {
        "claude" => format!(
            "claude -p --output-format stream-json --verbose -p '{}'",
            std::env::var("CLAUDE_CONFIG_DIR").unwrap_or_default()
        ),
        "codex" => format!("codex exec -"),
        other => return Err(anyhow::anyhow!("Unsupported vendor: {}", other)),
    };

    info!(
        "Spawned chat turn {} for {} session {}",
        turn_id,
        profile.vendor,
        session_id
    );

    // Send first chunk via input callback
    let first_chunk = Some((RecordUsageInput::default(), None));
    if let Some((usage, parsed)) = first_chunk {
        let _ = input(serde_json::to_string(&parsed).unwrap_or_default());
    }

    // Record session + chat
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    sqlx::query(
        r#"INSERT INTO sessions (id, profile_id, project_id, pid, started_at, status, origin)
        VALUES (?1, ?2, ?3, ?4, ?5, 'running', 'chat')"#,
    )
    .bind(&session_id)
    .bind(&profile.id)
    .bind(&project_path)
    .bind(-1i64)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(Some((usage, parsed)))
}

/// Record a detected rate limit event and mark this turn for auto-switch.
pub async fn handle_limit(
    pool: &sqlx::SqlitePool,
    db: &Db,
    chat_id: &str,
    session_id: &str,
    raw_signal: String,
    detail: String,
) -> anyhow::Result<()> {
    let event = crate::adapters::record_limit_event(
        pool,
        session_id,
        &session_id,
        "stdout",
        &raw_signal,
        Some(&detail),
    )
    .await?;

    // Determine eligible MRU target profile (same vendor, not client)
    let target = switching::suggest_switch(pool, &session_id).await?;

    if let Some(target) = target {
        let secret = get_secret(&target.id)?;
        let reason = SwitchReason::limit;
        let outcome = if target.tag == "client" {
            SwitchOutcome::blocked_client_auto
        } else if target.vendor == "claude" || target.vendor == "codex" {
            SwitchOutcome::completed
        } else {
            SwitchOutcome::completed
        };

        let switch_event = switching::record_switch_event(
            pool,
            Some(session_id),
            &session_id,
            &target.id,
            &chat_id,
            &reason,
            &outcome,
            Some(&target.id),
            Some(&format!("Rate limit switched from {} to {}", session_id, target.id)),
        )
        .await?;

        info!(
            "Auto-switched from {} to {} on rate boundary",
            session_id,
            target.id
        );
    }

    Ok(())
}