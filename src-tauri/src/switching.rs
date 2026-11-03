use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tracing::info;
use uuid::Uuid;

use crate::process::{self, ProcessManager, Session, SpawnOptions};
use crate::profiles::{self, Profile};
use crate::projects;

/// Recorded profile switch event in SQLite database.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SwitchEvent {
    pub id: String,
    pub session_id: Option<String>,
    pub from_profile_id: String,
    pub to_profile_id: String,
    pub project_id: Option<String>,
    pub reason: String,  // "manual" | "limit" | "auto"
    pub outcome: String, // "completed" | "cancelled" | "confirmed_client_boundary" | "blocked_client_auto" | "no_eligible"
    pub new_session_id: Option<String>,
    pub switched_at: String,
    pub detail: Option<String>,
}

/// Result returned from executing a switch operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchExecutionResult {
    pub switch_event: Option<SwitchEvent>,
    pub new_session: Option<Session>,
    pub requires_client_confirmation: bool,
    pub confirmation_message: Option<String>,
}

/// Suggest the Most Recently Used (MRU) non-client profile for the same vendor.
///
/// Rules:
/// 1. Must match vendor of `from_profile`.
/// 2. Must not be `from_profile` itself.
/// 3. Must NOT be a client-tagged profile (`tag != 'client'`).
/// 4. Ordered by MRU session start time (or profile creation time).
/// 5. Returns `None` if no eligible profile exists.
pub async fn suggest_switch(
    pool: &SqlitePool,
    from_profile_id: &str,
) -> anyhow::Result<Option<Profile>> {
    let from_profile = profiles::get_profile(pool, from_profile_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Source profile {} not found", from_profile_id))?;

    // Query active same-vendor non-client profiles, sorted by MRU session started_at
    let candidates = sqlx::query_as::<_, Profile>(
        r#"
        SELECT p.id, p.label, p.vendor, p.tag, p.config_dir, p.cred_ref, p.created_at, p.updated_at, p.is_active
        FROM profiles p
        LEFT JOIN (
            SELECT profile_id, MAX(started_at) as last_used
            FROM sessions
            GROUP BY profile_id
        ) s ON p.id = s.profile_id
        WHERE p.is_active = 1
          AND p.vendor = ?1
          AND p.id != ?2
          AND p.tag != 'client'
        ORDER BY s.last_used DESC NULLS LAST, p.created_at DESC
        LIMIT 1
        "#,
    )
    .bind(&from_profile.vendor)
    .bind(from_profile_id)
    .fetch_optional(pool)
    .await?;

    Ok(candidates)
}

/// Record a switch event record in SQLite (guarantees AC-11: exactly one row per switch attempt).
pub async fn record_switch_event(
    pool: &SqlitePool,
    session_id: Option<&str>,
    from_profile_id: &str,
    to_profile_id: &str,
    project_id: Option<&str>,
    reason: &str,
    outcome: &str,
    new_session_id: Option<&str>,
    detail: Option<&str>,
) -> anyhow::Result<SwitchEvent> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO switch_events (id, session_id, from_profile_id, to_profile_id, project_id, reason, outcome, new_session_id, switched_at, detail)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
    )
    .bind(&id)
    .bind(session_id)
    .bind(from_profile_id)
    .bind(to_profile_id)
    .bind(project_id)
    .bind(reason)
    .bind(outcome)
    .bind(new_session_id)
    .bind(&now)
    .bind(detail)
    .execute(pool)
    .await?;

    info!(
        "Recorded SwitchEvent: {} from {} to {}, outcome={}",
        id, from_profile_id, to_profile_id, outcome
    );

    Ok(SwitchEvent {
        id,
        session_id: session_id.map(|s| s.to_string()),
        from_profile_id: from_profile_id.to_string(),
        to_profile_id: to_profile_id.to_string(),
        project_id: project_id.map(|s| s.to_string()),
        reason: reason.to_string(),
        outcome: outcome.to_string(),
        new_session_id: new_session_id.map(|s| s.to_string()),
        switched_at: now,
        detail: detail.map(|s| s.to_string()),
    })
}

/// Execute a profile switch and spawn a fresh session.
///
/// Acceptance Criteria Enforced:
/// - AC-05: Spawns new session row; original session row is NEVER mutated or terminated.
/// - AC-07: Switching into or out of client profile requires explicit confirmation.
/// - AC-11: Exactly one SwitchEvent row recorded per attempt.
pub async fn execute_switch(
    pool: &SqlitePool,
    process_mgr: &ProcessManager,
    session_id: Option<&str>,
    from_profile_id: &str,
    to_profile_id: &str,
    project_id: Option<&str>,
    reason: &str,
    client_confirmed: bool,
) -> anyhow::Result<SwitchExecutionResult> {
    let from_profile = profiles::get_profile(pool, from_profile_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Source profile {} not found", from_profile_id))?;

    let to_profile = profiles::get_profile(pool, to_profile_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Target profile {} not found", to_profile_id))?;

    let is_client_boundary = from_profile.tag == "client" || to_profile.tag == "client";

    // 1. Client boundary check (AC-07). No audit row is written until the user
    // confirms or cancels, so one attempt produces exactly one row (AC-11).
    if is_client_boundary && !client_confirmed {
        let message = format!(
            "Move to a client account? This starts a new session in {} · {} ({}). Client accounts are protected.",
            to_profile.label, to_profile.tag, to_profile.vendor
        );

        return Ok(SwitchExecutionResult {
            switch_event: None,
            new_session: None,
            requires_client_confirmation: true,
            confirmation_message: Some(message),
        });
    }

    // 2. Resolve project path and terminal preference if applicable
    let mut resolved_path = None;
    let mut resolved_terminal = None;
    if let Some(pid) = project_id {
        if let Ok(Some(proj)) = projects::get_project(pool, pid).await {
            resolved_path = Some(std::path::PathBuf::from(proj.path));
            resolved_terminal = Some(proj.terminal);
        }
    }

    // 3. Retrieve secret for to_profile
    let secret = profiles::get_secret(&to_profile.id)?;

    // 4. Spawn new session (AC-05: original session is untouched)
    let opts = SpawnOptions {
        profile: &to_profile,
        project_path: resolved_path.as_deref(),
        project_id: project_id.map(|s| s.to_string()),
        terminal: resolved_terminal.as_deref(),
        secret: secret.as_deref(),
    };

    let new_session = process::spawn_session(pool, process_mgr, opts).await?;

    // 5. Determine final outcome
    let outcome = if is_client_boundary {
        "confirmed_client_boundary"
    } else {
        "completed"
    };

    let switch_event = record_switch_event(
        pool,
        session_id,
        from_profile_id,
        to_profile_id,
        project_id,
        reason,
        outcome,
        Some(&new_session.id),
        Some(&format!(
            "Switched from {} to {}",
            from_profile.label, to_profile.label
        )),
    )
    .await?;

    Ok(SwitchExecutionResult {
        switch_event: Some(switch_event),
        new_session: Some(new_session),
        requires_client_confirmation: false,
        confirmation_message: None,
    })
}

/// Record user cancellation of a switch dialog (AC-07).
pub async fn record_cancellation(
    pool: &SqlitePool,
    session_id: Option<&str>,
    from_profile_id: &str,
    to_profile_id: &str,
    project_id: Option<&str>,
    reason: &str,
    detail: &str,
) -> anyhow::Result<SwitchEvent> {
    record_switch_event(
        pool,
        session_id,
        from_profile_id,
        to_profile_id,
        project_id,
        reason,
        "cancelled",
        None,
        Some(detail),
    )
    .await
}

/// List recent switch events for the audit log.
pub async fn list_switch_events(pool: &SqlitePool, limit: i64) -> anyhow::Result<Vec<SwitchEvent>> {
    let events = sqlx::query_as::<_, SwitchEvent>(
        r#"
        SELECT id, session_id, from_profile_id, to_profile_id, project_id, reason, outcome, new_session_id, switched_at, detail
        FROM switch_events
        ORDER BY switched_at DESC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE profiles (
                id          TEXT PRIMARY KEY,
                label       TEXT NOT NULL,
                vendor      TEXT NOT NULL,
                tag         TEXT NOT NULL,
                config_dir  TEXT NOT NULL,
                cred_ref    TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                is_active   INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE sessions (
                id          TEXT PRIMARY KEY,
                profile_id  TEXT NOT NULL,
                project_id  TEXT,
                pid         INTEGER,
                started_at  TEXT NOT NULL,
                ended_at    TEXT,
                exit_code   INTEGER,
                status      TEXT NOT NULL DEFAULT 'running'
            );

            CREATE TABLE switch_events (
                id                  TEXT PRIMARY KEY,
                session_id          TEXT,
                from_profile_id     TEXT NOT NULL,
                to_profile_id       TEXT NOT NULL,
                project_id          TEXT,
                reason              TEXT NOT NULL,
                outcome             TEXT NOT NULL,
                new_session_id      TEXT,
                switched_at         TEXT NOT NULL,
                detail              TEXT
            );
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn test_suggest_switch_mru_non_client_same_vendor() {
        let pool = setup_test_db().await;
        let now = Utc::now().to_rfc3339();

        // Profile 1: Work (source)
        sqlx::query("INSERT INTO profiles VALUES ('p1', 'Claude Work', 'claude', 'work', 'C:/p1', 'g:p1', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();

        // Profile 2: Client Acme (must be excluded because tag=client)
        sqlx::query("INSERT INTO profiles VALUES ('p2', 'Claude Client Acme', 'claude', 'client', 'C:/p2', 'g:p2', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();

        // Profile 3: Personal 1 (older session)
        sqlx::query("INSERT INTO profiles VALUES ('p3', 'Claude Personal 1', 'claude', 'personal', 'C:/p3', 'g:p3', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sessions VALUES ('s1', 'p3', NULL, 100, '2026-01-01T10:00:00Z', NULL, NULL, 'running')")
            .execute(&pool).await.unwrap();

        // Profile 4: Personal 2 (most recently used session!)
        sqlx::query("INSERT INTO profiles VALUES ('p4', 'Claude Personal 2', 'claude', 'personal', 'C:/p4', 'g:p4', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO sessions VALUES ('s2', 'p4', NULL, 101, '2026-01-01T12:00:00Z', NULL, NULL, 'running')")
            .execute(&pool).await.unwrap();

        // Profile 5: Codex Personal (must be excluded because different vendor)
        sqlx::query("INSERT INTO profiles VALUES ('p5', 'Codex Personal', 'codex', 'personal', 'C:/p5', 'g:p5', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();

        let suggestion = suggest_switch(&pool, "p1").await.unwrap();
        assert!(suggestion.is_some());
        let target = suggestion.unwrap();

        // Must recommend p4 because it's the MRU same-vendor non-client profile!
        assert_eq!(target.id, "p4");
        assert_eq!(target.label, "Claude Personal 2");
    }

    #[tokio::test]
    async fn test_suggest_switch_none_eligible() {
        let pool = setup_test_db().await;
        let now = Utc::now().to_rfc3339();

        // Only one profile exists
        sqlx::query("INSERT INTO profiles VALUES ('p1', 'Only Profile', 'claude', 'work', 'C:/p1', 'g:p1', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();

        // Attempting to suggest fallback for p1
        let suggestion = suggest_switch(&pool, "p1").await.unwrap();
        assert!(
            suggestion.is_none(),
            "When no other profiles exist, must return None"
        );
    }

    #[tokio::test]
    async fn test_record_cancellation_writes_cancelled_outcome() {
        let pool = setup_test_db().await;

        let event = record_cancellation(
            &pool,
            Some("s1"),
            "p1",
            "p2_client",
            None,
            "manual",
            "User clicked cancel in client modal",
        )
        .await
        .unwrap();

        assert_eq!(event.outcome, "cancelled");

        // Assert exactly 1 row in switch_events (AC-11)
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM switch_events")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1);
    }
}
