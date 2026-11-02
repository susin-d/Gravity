use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::adapters::claude::ClaudeAdapter;
use crate::adapters::codex::CodexAdapter;
use crate::profiles::Profile;
use crate::usage::UsageReading;

pub mod claude;
pub mod codex;

/// Health status of a CLI provider adapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AdapterHealth {
    Ok,
    Degraded,
}

/// Result of evaluating a terminal stream line or exit code for rate limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionResult {
    pub is_limit: bool,
    pub raw_signal: String,
    pub detail: String,
}

/// Recorded rate limit event in SQLite database.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LimitEvent {
    pub id: String,
    pub session_id: String,
    pub profile_id: String,
    pub detected_at: String,
    pub source: String, // "stdout", "exit_code", "api"
    pub raw_signal: String,
    pub detail: Option<String>,
}

/// Core interface implemented by all CLI provider adapters.
pub trait ProviderAdapter: Send + Sync {
    /// Vendor identifier ("claude" | "codex").
    fn vendor(&self) -> &'static str;

    /// Inspect a single stdout/stderr line and/or exit code.
    fn detect_limit(&self, line: &str, exit_code: Option<i32>) -> Option<DetectionResult>;

    /// Read usage metrics from local config directory or return an unknown state.
    fn read_usage(&self, profile: &Profile) -> UsageReading;

    /// Return current adapter health status.
    fn health(&self) -> AdapterHealth;
}

/// Factory function to return the adapter for a given vendor.
pub fn get_adapter_for_vendor(vendor: &str) -> Option<Box<dyn ProviderAdapter>> {
    match vendor.to_lowercase().as_str() {
        "claude" => Some(Box::new(ClaudeAdapter::new())),
        "codex" => Some(Box::new(CodexAdapter::new())),
        _ => None,
    }
}

/// Record a detected limit event in the SQLite database.
pub async fn record_limit_event(
    pool: &sqlx::SqlitePool,
    session_id: &str,
    profile_id: &str,
    source: &str,
    raw_signal: &str,
    detail: Option<&str>,
) -> anyhow::Result<LimitEvent> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO limit_events (id, session_id, profile_id, detected_at, source, raw_signal, detail)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
    )
    .bind(&id)
    .bind(session_id)
    .bind(profile_id)
    .bind(&now)
    .bind(source)
    .bind(raw_signal)
    .bind(detail)
    .execute(pool)
    .await?;

    Ok(LimitEvent {
        id,
        session_id: session_id.to_string(),
        profile_id: profile_id.to_string(),
        detected_at: now,
        source: source.to_string(),
        raw_signal: raw_signal.to_string(),
        detail: detail.map(|s| s.to_string()),
    })
}

/// List recent limit events.
pub async fn list_limit_events(
    pool: &sqlx::SqlitePool,
    limit: i64,
) -> anyhow::Result<Vec<LimitEvent>> {
    let events = sqlx::query_as::<_, LimitEvent>(
        r#"
        SELECT id, session_id, profile_id, detected_at, source, raw_signal, detail
        FROM limit_events
        ORDER BY detected_at DESC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(events)
}
