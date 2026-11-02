use sqlx::SqlitePool;
use tracing::{info, warn};

use crate::flags::FeatureFlags;
use crate::process::{self, ProcessManager, Session, SpawnOptions};
use crate::profiles;
use crate::projects;
use crate::switching::{self, SwitchEvent};

/// Evaluates auto-switch rules and executes an automated switch at a session limit boundary.
///
/// STRICT SECURITY GUARDS (Prime Directive #4 & AC-10):
/// 1. Master Flag Guard: `flags.auto_switch == true` (default false in flags.toml).
/// 2. Project Policy Guard: `project.auto_switch_enabled == 1`.
/// 3. Client Project Lockout: Project `tag != 'client'`.
/// 4. Client Source Profile Lockout: Source profile `tag != 'client'`.
/// 5. Client Target Profile Lockout: Target profile `tag != 'client'`.
/// If ANY client boundary is encountered during auto-switch, it is strictly aborted and
/// logged as `outcome = 'blocked_client_auto'`.
pub async fn maybe_auto_switch(
    pool: &SqlitePool,
    process_mgr: &ProcessManager,
    session_id: &str,
    flags: &FeatureFlags,
) -> anyhow::Result<Option<SwitchEvent>> {
    // Guard 1: Master feature flag must be enabled
    if !flags.auto_switch {
        info!("Auto-switch ignored: feature flag auto_switch is false");
        return Ok(None);
    }

    // 1. Fetch current session
    let session = sqlx::query_as::<_, Session>(
        r#"
        SELECT id, profile_id, project_id, pid, started_at, ended_at, exit_code, status
        FROM sessions
        WHERE id = ?1
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| anyhow::anyhow!("Session {} not found", session_id))?;

    // Guard 2: Must be associated with a registered project
    let project_id = match session.project_id {
        Some(ref pid) => pid.clone(),
        None => {
            info!("Auto-switch ignored: session {} has no associated project", session_id);
            return Ok(None);
        }
    };

    let project = projects::get_project(pool, &project_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Project {} not found", project_id))?;

    // Guard 3: Project must have auto-switch enabled
    if project.auto_switch_enabled == 0 {
        info!("Auto-switch ignored: project {} has auto_switch_enabled = 0", project.name);
        return Ok(None);
    }

    // Guard 4: Client Project Lockout
    if project.tag == "client" {
        warn!("BLOCKED AUTO-SWITCH: Project {} is tagged 'client'", project.name);
        let event = switching::record_switch_event(
            pool,
            Some(session_id),
            &session.profile_id,
            &session.profile_id,
            Some(&project_id),
            "auto",
            "blocked_client_auto",
            None,
            Some("Auto-switch blocked: project has client boundary tag"),
        )
        .await?;
        return Ok(Some(event));
    }

    // Guard 5: Source Profile Client Lockout
    let from_profile = profiles::get_profile(pool, &session.profile_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Profile {} not found", session.profile_id))?;

    if from_profile.tag == "client" {
        warn!("BLOCKED AUTO-SWITCH: Source profile {} is tagged 'client'", from_profile.label);
        let event = switching::record_switch_event(
            pool,
            Some(session_id),
            &session.profile_id,
            &session.profile_id,
            Some(&project_id),
            "auto",
            "blocked_client_auto",
            None,
            Some("Auto-switch blocked: source profile has client tag"),
        )
        .await?;
        return Ok(Some(event));
    }

    // 2. Select eligible MRU target profile
    let target_profile = match switching::suggest_switch(pool, &session.profile_id).await? {
        Some(p) => p,
        None => {
            info!("Auto-switch: no eligible fallback profile for {}", session.profile_id);
            let event = switching::record_switch_event(
                pool,
                Some(session_id),
                &session.profile_id,
                &session.profile_id,
                Some(&project_id),
                "auto",
                "no_eligible",
                None,
                Some("No eligible non-client same-vendor fallback profiles available"),
            )
            .await?;
            return Ok(Some(event));
        }
    };

    // Guard 6: Target Profile Client Lockout
    if target_profile.tag == "client" {
        warn!("BLOCKED AUTO-SWITCH: Target profile {} is tagged 'client'", target_profile.label);
        let event = switching::record_switch_event(
            pool,
            Some(session_id),
            &session.profile_id,
            &target_profile.id,
            Some(&project_id),
            "auto",
            "blocked_client_auto",
            None,
            Some("Auto-switch blocked: target profile has client tag"),
        )
        .await?;
        return Ok(Some(event));
    }

    // 3. All guards passed: execute automated switch
    info!(
        "Executing auto-switch for project {} from {} to {}",
        project.name, from_profile.label, target_profile.label
    );

    let secret = profiles::get_secret(&target_profile.id)?;
    let opts = SpawnOptions {
        profile: &target_profile,
        project_path: Some(std::path::Path::new(&project.path)),
        project_id: Some(project_id.clone()),
        secret: secret.as_deref(),
        custom_command: None,
    };

    let new_session = process::spawn_session(pool, process_mgr, opts).await?;

    let event = switching::record_switch_event(
        pool,
        Some(session_id),
        &session.profile_id,
        &target_profile.id,
        Some(&project_id),
        "auto",
        "completed",
        Some(&new_session.id),
        Some(&format!(
            "Auto-switched from {} to {} on rate limit boundary",
            from_profile.label, target_profile.label
        )),
    )
    .await?;

    Ok(Some(event))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
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

            CREATE TABLE projects (
                id                  TEXT PRIMARY KEY,
                path                TEXT NOT NULL UNIQUE,
                name                TEXT NOT NULL,
                tag                 TEXT NOT NULL,
                auto_switch_enabled INTEGER NOT NULL DEFAULT 0,
                default_profile_id  TEXT,
                terminal            TEXT NOT NULL DEFAULT 'auto',
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
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
    async fn test_auto_switch_flag_disabled_returns_none() {
        let pool = setup_test_db().await;
        let mgr = ProcessManager::new();
        let flags = FeatureFlags { auto_switch: false };

        let res = maybe_auto_switch(&pool, &mgr, "s1", &flags).await.unwrap();
        assert!(res.is_none());
    }

    #[tokio::test]
    async fn test_auto_switch_blocked_for_client_project() {
        let pool = setup_test_db().await;
        let mgr = ProcessManager::new();
        let flags = FeatureFlags { auto_switch: true };
        let now = Utc::now().to_rfc3339();

        // Profile
        sqlx::query("INSERT INTO profiles VALUES ('p1', 'Work Profile', 'claude', 'work', 'C:/p1', 'g:p1', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();

        // Client project with auto_switch forced in DB
        sqlx::query("INSERT INTO projects VALUES ('proj1', 'C:/client', 'Client App', 'client', 1, 'p1', 'auto', ?1, ?1)")
            .bind(&now).execute(&pool).await.unwrap();

        // Session
        sqlx::query("INSERT INTO sessions VALUES ('s1', 'p1', 'proj1', 123, ?1, NULL, NULL, 'running')")
            .bind(&now).execute(&pool).await.unwrap();

        let res = maybe_auto_switch(&pool, &mgr, "s1", &flags).await.unwrap();
        assert!(res.is_some());
        let event = res.unwrap();
        assert_eq!(event.outcome, "blocked_client_auto");
    }

    #[tokio::test]
    async fn test_auto_switch_blocked_for_client_profile() {
        let pool = setup_test_db().await;
        let mgr = ProcessManager::new();
        let flags = FeatureFlags { auto_switch: true };
        let now = Utc::now().to_rfc3339();

        // Client source profile
        sqlx::query("INSERT INTO profiles VALUES ('p_client', 'Client Profile', 'claude', 'client', 'C:/pc', 'g:pc', ?1, ?1, 1)")
            .bind(&now).execute(&pool).await.unwrap();

        // Regular project
        sqlx::query("INSERT INTO projects VALUES ('proj1', 'C:/work', 'Work App', 'work', 1, 'p_client', 'auto', ?1, ?1)")
            .bind(&now).execute(&pool).await.unwrap();

        // Session
        sqlx::query("INSERT INTO sessions VALUES ('s1', 'p_client', 'proj1', 123, ?1, NULL, NULL, 'running')")
            .bind(&now).execute(&pool).await.unwrap();

        let res = maybe_auto_switch(&pool, &mgr, "s1", &flags).await.unwrap();
        assert!(res.is_some());
        let event = res.unwrap();
        assert_eq!(event.outcome, "blocked_client_auto");
    }
}
