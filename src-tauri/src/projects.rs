use std::path::Path;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tracing::info;
use uuid::Uuid;

use crate::flags::FeatureFlags;

/// Project database model.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub path: String,
    pub name: String,
    pub tag: String, // "personal" | "work" | "client"
    pub auto_switch_enabled: i64,
    pub default_profile_id: Option<String>,
    pub terminal: String, // "auto" | "wt" | "powershell"
    pub created_at: String,
    pub updated_at: String,
}

/// Input payload for registering a new project.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectInput {
    pub path: String,
    pub name: Option<String>,
    pub tag: String, // "personal" | "work" | "client"
    pub default_profile_id: Option<String>,
    pub terminal: Option<String>, // "auto" | "wt" | "powershell"
}

/// Input payload for updating an existing project.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectInput {
    pub name: String,
    pub tag: String, // "personal" | "work" | "client"
    pub default_profile_id: Option<String>,
    pub terminal: String,
}

/// Normalize path for consistent SQLite storage on Windows.
pub fn normalize_path(raw_path: &str) -> String {
    let p = Path::new(raw_path);
    // Canonicalize if possible, otherwise clean slashes
    match p.canonicalize() {
        Ok(canonical) => {
            let mut s = canonical.to_string_lossy().to_string();
            // Strip UNC prefix \\?\ if present for display cleanliness
            if s.starts_with(r"\\?\") {
                s = s[4..].to_string();
            }
            s
        }
        Err(_) => raw_path.replace('/', "\\").trim_end_matches('\\').to_string(),
    }
}

/// Register a new project folder in the SQLite database.
pub async fn create_project(
    pool: &SqlitePool,
    input: CreateProjectInput,
) -> anyhow::Result<Project> {
    let normalized = normalize_path(&input.path);

    // Validate tag
    if input.tag != "personal" && input.tag != "work" && input.tag != "client" {
        return Err(anyhow::anyhow!("Invalid tag: {}", input.tag));
    }

    // Infer name if not specified
    let name = match input.name {
        Some(ref n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => Path::new(&normalized)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "project".to_string()),
    };

    let terminal = input.terminal.unwrap_or_else(|| "auto".to_string());
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO projects (id, path, name, tag, auto_switch_enabled, default_profile_id, terminal, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8)
        "#,
    )
    .bind(&id)
    .bind(&normalized)
    .bind(&name)
    .bind(&input.tag)
    .bind(&input.default_profile_id)
    .bind(&terminal)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    info!("Project registered: {} ({}) with tag {}", name, id, input.tag);

    Ok(Project {
        id,
        path: normalized,
        name,
        tag: input.tag,
        auto_switch_enabled: 0,
        default_profile_id: input.default_profile_id,
        terminal,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// List all registered projects.
pub async fn list_projects(pool: &SqlitePool) -> anyhow::Result<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>(
        r#"
        SELECT id, path, name, tag, auto_switch_enabled, default_profile_id, terminal, created_at, updated_at
        FROM projects
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(projects)
}

/// Get a project by ID.
pub async fn get_project(pool: &SqlitePool, id: &str) -> anyhow::Result<Option<Project>> {
    let project = sqlx::query_as::<_, Project>(
        r#"
        SELECT id, path, name, tag, auto_switch_enabled, default_profile_id, terminal, created_at, updated_at
        FROM projects
        WHERE id = ?1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(project)
}

/// Update an existing project's metadata.
pub async fn update_project(
    pool: &SqlitePool,
    id: &str,
    input: UpdateProjectInput,
) -> anyhow::Result<Project> {
    if input.tag != "personal" && input.tag != "work" && input.tag != "client" {
        return Err(anyhow::anyhow!("Invalid tag: {}", input.tag));
    }

    let now = Utc::now().to_rfc3339();

    // If tag changed to client, force auto_switch_enabled to 0 immediately
    let auto_switch_override = if input.tag == "client" { Some(0) } else { None };

    if let Some(force_zero) = auto_switch_override {
        sqlx::query(
            r#"
            UPDATE projects
            SET name = ?2, tag = ?3, default_profile_id = ?4, terminal = ?5, auto_switch_enabled = ?6, updated_at = ?7
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .bind(&input.name)
        .bind(&input.tag)
        .bind(&input.default_profile_id)
        .bind(&input.terminal)
        .bind(force_zero)
        .bind(&now)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            r#"
            UPDATE projects
            SET name = ?2, tag = ?3, default_profile_id = ?4, terminal = ?5, updated_at = ?6
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .bind(&input.name)
        .bind(&input.tag)
        .bind(&input.default_profile_id)
        .bind(&input.terminal)
        .bind(&now)
        .execute(pool)
        .await?;
    }

    let updated = get_project(pool, id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Project not found after update"))?;

    Ok(updated)
}

/// Set auto-switch policy for a project.
///
/// HARD SECURITY GUARDS:
/// 1. If flags.auto_switch is false, enabling auto-switch returns an error.
/// 2. If project tag is 'client', enabling auto-switch returns an error.
pub async fn set_auto_switch(
    pool: &SqlitePool,
    project_id: &str,
    enabled: bool,
    flags: &FeatureFlags,
) -> anyhow::Result<()> {
    if enabled {
        // Guard 1: Master feature flag check
        if !flags.auto_switch {
            return Err(anyhow::anyhow!(
                "Auto-switch cannot be enabled: feature flag 'auto_switch' is disabled in flags.toml"
            ));
        }

        // Guard 2: Client boundary protection
        let project = get_project(pool, project_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Project {} not found", project_id))?;

        if project.tag == "client" {
            return Err(anyhow::anyhow!(
                "Auto-switch cannot be enabled: Client projects are strictly protected from automated switching"
            ));
        }
    }

    let val: i64 = if enabled { 1 } else { 0 };
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        UPDATE projects
        SET auto_switch_enabled = ?2, updated_at = ?3
        WHERE id = ?1
        "#,
    )
    .bind(project_id)
    .bind(val)
    .bind(&now)
    .execute(pool)
    .await?;

    info!("Project {} auto_switch_enabled set to {}", project_id, enabled);
    Ok(())
}

/// Remove a project from the registry (does NOT delete local files on disk).
pub async fn delete_project(pool: &SqlitePool, id: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM projects WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;

    info!("Project removed from registry: {}", id);
    Ok(())
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
            CREATE TABLE projects (
                id                  TEXT PRIMARY KEY,
                path                TEXT NOT NULL UNIQUE,
                name                TEXT NOT NULL,
                tag                 TEXT NOT NULL DEFAULT 'personal' CHECK (tag IN ('personal', 'work', 'client')),
                auto_switch_enabled INTEGER NOT NULL DEFAULT 0,
                default_profile_id  TEXT,
                terminal            TEXT NOT NULL DEFAULT 'auto',
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            );
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn test_create_and_list_projects() {
        let pool = setup_test_db().await;
        let input = CreateProjectInput {
            path: "C:\\Projects\\MyApp".to_string(),
            name: Some("MyApp".to_string()),
            tag: "work".to_string(),
            default_profile_id: None,
            terminal: None,
        };

        let proj = create_project(&pool, input).await.unwrap();
        assert_eq!(proj.name, "MyApp");
        assert_eq!(proj.tag, "work");
        assert_eq!(proj.auto_switch_enabled, 0);

        let list = list_projects(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, proj.id);
    }

    #[tokio::test]
    async fn test_client_project_blocks_auto_switch() {
        let pool = setup_test_db().await;
        let input = CreateProjectInput {
            path: "C:\\Projects\\ClientApp".to_string(),
            name: Some("ClientApp".to_string()),
            tag: "client".to_string(),
            default_profile_id: None,
            terminal: None,
        };

        let proj = create_project(&pool, input).await.unwrap();
        let flags = FeatureFlags { auto_switch: true };

        // Attempt to enable auto-switch on client project
        let result = set_auto_switch(&pool, &proj.id, true, &flags).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Client projects"));

        // Verify it remained 0
        let reloaded = get_project(&pool, &proj.id).await.unwrap().unwrap();
        assert_eq!(reloaded.auto_switch_enabled, 0);
    }

    #[tokio::test]
    async fn test_flag_disabled_blocks_auto_switch() {
        let pool = setup_test_db().await;
        let input = CreateProjectInput {
            path: "C:\\Projects\\PersonalApp".to_string(),
            name: Some("PersonalApp".to_string()),
            tag: "personal".to_string(),
            default_profile_id: None,
            terminal: None,
        };

        let proj = create_project(&pool, input).await.unwrap();
        let flags = FeatureFlags { auto_switch: false };

        // Attempt to enable auto-switch when flag is false
        let result = set_auto_switch(&pool, &proj.id, true, &flags).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("flags.toml"));
    }

    #[tokio::test]
    async fn test_valid_project_allows_auto_switch_with_flag() {
        let pool = setup_test_db().await;
        let input = CreateProjectInput {
            path: "C:\\Projects\\PersonalApp".to_string(),
            name: Some("PersonalApp".to_string()),
            tag: "personal".to_string(),
            default_profile_id: None,
            terminal: None,
        };

        let proj = create_project(&pool, input).await.unwrap();
        let flags = FeatureFlags { auto_switch: true };

        let result = set_auto_switch(&pool, &proj.id, true, &flags).await;
        assert!(result.is_ok());

        let reloaded = get_project(&pool, &proj.id).await.unwrap().unwrap();
        assert_eq!(reloaded.auto_switch_enabled, 1);
    }
}
