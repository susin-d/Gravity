use std::collections::HashMap;
use std::path::Path;

use chrono::Utc;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tracing::{info, warn};
use uuid::Uuid;

/// Profile database model.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Profile {
    pub id: String,
    pub label: String,
    pub vendor: String, // "claude" | "codex"
    pub tag: String,    // "personal" | "work" | "client"
    pub config_dir: String,
    pub cred_ref: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_active: i64,
}

/// Create profile request payload from frontend.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProfileInput {
    pub label: String,
    pub vendor: String, // "claude" | "codex"
    pub tag: String,    // "personal" | "work" | "client"
    pub secret: Option<String>,
}

/// Keyring service prefix for Gravity credentials.
pub const KEYRING_SERVICE_PREFIX: &str = "gravity:";

/// Store an API secret in the Windows Credential Manager.
pub fn store_secret(profile_id: &str, secret: &str) -> anyhow::Result<()> {
    let service = format!("{}{}", KEYRING_SERVICE_PREFIX, profile_id);
    let entry = Entry::new(&service, "api_key")?;
    entry.set_password(secret)?;
    info!("Credential stored in Windows Credential Manager for profile {}", profile_id);
    Ok(())
}

/// Retrieve an API secret from the Windows Credential Manager.
pub fn get_secret(profile_id: &str) -> anyhow::Result<Option<String>> {
    let service = format!("{}{}", KEYRING_SERVICE_PREFIX, profile_id);
    let entry = Entry::new(&service, "api_key")?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(anyhow::anyhow!("Failed to read credential: {e}")),
    }
}

/// Remove an API secret from the Windows Credential Manager.
pub fn delete_secret(profile_id: &str) -> anyhow::Result<()> {
    let service = format!("{}{}", KEYRING_SERVICE_PREFIX, profile_id);
    let entry = Entry::new(&service, "api_key")?;
    match entry.delete_credential() {
        Ok(()) => {
            info!("Credential removed from Windows Credential Manager for profile {}", profile_id);
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            warn!("Failed to delete credential for {}: {e}", profile_id);
            Ok(())
        }
    }
}

/// Create a new profile with its isolated filesystem directory and optional credential.
pub async fn create_profile(
    pool: &SqlitePool,
    app_data: &Path,
    input: CreateProfileInput,
) -> anyhow::Result<Profile> {
    let id = Uuid::new_v4().to_string();
    let config_dir = app_data.join("profiles").join(&id);

    // Create the isolated configuration directory
    std::fs::create_dir_all(&config_dir)?;

    let config_dir_str = config_dir.to_string_lossy().to_string();
    let cred_ref = format!("{}{}", KEYRING_SERVICE_PREFIX, id);
    let now = Utc::now().to_rfc3339();

    // Validate vendor
    if input.vendor != "claude" && input.vendor != "codex" {
        return Err(anyhow::anyhow!("Invalid vendor: {}", input.vendor));
    }

    // Validate tag
    if input.tag != "personal" && input.tag != "work" && input.tag != "client" {
        return Err(anyhow::anyhow!("Invalid tag: {}", input.tag));
    }

    // Store credential in Windows Credential Manager if provided
    if let Some(ref sec) = input.secret {
        if !sec.trim().is_empty() {
            store_secret(&id, sec.trim())?;
        }
    }

    // Insert into SQLite database (secret is NEVER stored here)
    sqlx::query(
        r#"
        INSERT INTO profiles (id, label, vendor, tag, config_dir, cred_ref, created_at, updated_at, is_active)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.label)
    .bind(&input.vendor)
    .bind(&input.tag)
    .bind(&config_dir_str)
    .bind(&cred_ref)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    info!("Profile created: {} ({}) with tag {}", input.label, id, input.tag);

    Ok(Profile {
        id,
        label: input.label,
        vendor: input.vendor,
        tag: input.tag,
        config_dir: config_dir_str,
        cred_ref,
        created_at: now.clone(),
        updated_at: now,
        is_active: 1,
    })
}

/// List all active profiles.
pub async fn list_profiles(pool: &SqlitePool) -> anyhow::Result<Vec<Profile>> {
    let profiles = sqlx::query_as::<_, Profile>(
        r#"
        SELECT id, label, vendor, tag, config_dir, cred_ref, created_at, updated_at, is_active
        FROM profiles
        WHERE is_active = 1
        ORDER BY created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(profiles)
}

/// Fetch a profile by ID.
pub async fn get_profile(pool: &SqlitePool, id: &str) -> anyhow::Result<Option<Profile>> {
    let profile = sqlx::query_as::<_, Profile>(
        r#"
        SELECT id, label, vendor, tag, config_dir, cred_ref, created_at, updated_at, is_active
        FROM profiles
        WHERE id = ?1 AND is_active = 1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(profile)
}

/// Soft-delete a profile and scrub its credential from Windows Credential Manager.
pub async fn delete_profile(pool: &SqlitePool, id: &str) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        UPDATE profiles
        SET is_active = 0, updated_at = ?2
        WHERE id = ?1
        "#,
    )
    .bind(id)
    .bind(Utc::now().to_rfc3339())
    .execute(pool)
    .await?;

    let _ = delete_secret(id);
    info!("Profile soft-deleted: {}", id);
    Ok(())
}

/// Build a fully sanitized environment block according to Prime Directive #1:
/// - Strips ALL `ANTHROPIC_*`, `OPENAI_*`, `CLAUDE_*`, `CODEX_*` from parent env.
/// - Injects vendor-isolated config directory (`CLAUDE_CONFIG_DIR` or `CODEX_HOME`).
/// - Adds API key if provided.
/// - Preserves essential Windows runtime variables.
pub fn build_env_block(profile: &Profile, secret: Option<&str>) -> HashMap<String, String> {
    let mut env: HashMap<String, String> = HashMap::new();

    // 1. Inherit only safe system variables from the host
    let safe_prefixes = [
        "SYSTEM", "PATH", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
        "APPDATA", "LOCALAPPDATA", "COMSPEC", "PATHEXT", "WINDIR", "OS", "NUMBER_OF_PROCESSORS",
        "PROCESSOR_", "PROGRAMDATA", "PROGRAMFILES", "COMMONPROGRAMFILES",
    ];

    for (k, v) in std::env::vars() {
        let upper_key = k.to_uppercase();

        // STRICT SANITIZATION: Never leak any AI vendor environment variable
        if upper_key.starts_with("ANTHROPIC_")
            || upper_key.starts_with("OPENAI_")
            || upper_key.starts_with("CLAUDE_")
            || upper_key.starts_with("CODEX_")
        {
            continue;
        }

        // Check if variable belongs to safe baseline set
        let is_safe = safe_prefixes
            .iter()
            .any(|prefix| upper_key.starts_with(prefix) || upper_key == *prefix);

        if is_safe {
            env.insert(k, v);
        }
    }

    // 2. Set vendor-explicit isolated config directory
    match profile.vendor.as_str() {
        "claude" => {
            env.insert("CLAUDE_CONFIG_DIR".to_string(), profile.config_dir.clone());
            if let Some(sec) = secret {
                if !sec.is_empty() {
                    env.insert("ANTHROPIC_API_KEY".to_string(), sec.to_string());
                }
            }
        }
        "codex" => {
            env.insert("CODEX_HOME".to_string(), profile.config_dir.clone());
            if let Some(sec) = secret {
                if !sec.is_empty() {
                    env.insert("OPENAI_API_KEY".to_string(), sec.to_string());
                }
            }
        }
        _ => {}
    }

    // Gravity tracking markers
    env.insert("GRAVITY_PROFILE_ID".to_string(), profile.id.clone());
    env.insert("GRAVITY_PROFILE_TAG".to_string(), profile.tag.clone());

    env
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_profile(vendor: &str, tag: &str) -> Profile {
        Profile {
            id: "test-uuid-1234".to_string(),
            label: "Test Profile".to_string(),
            vendor: vendor.to_string(),
            tag: tag.to_string(),
            config_dir: "C:\\AppData\\Gravity\\profiles\\test-uuid-1234".to_string(),
            cred_ref: "gravity:test-uuid-1234".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            is_active: 1,
        }
    }

    #[test]
    fn test_build_env_block_claude_isolation() {
        // Set dummy leaked variables in parent process
        std::env::set_var("ANTHROPIC_API_KEY", "leaked-anthropic-key");
        std::env::set_var("OPENAI_API_KEY", "leaked-openai-key");
        std::env::set_var("CLAUDE_TEST_VAR", "leaked-claude");

        let profile = dummy_profile("claude", "personal");
        let env = build_env_block(&profile, Some("legit-secret-key"));

        // Must NOT leak parent process secrets
        assert_ne!(env.get("ANTHROPIC_API_KEY").map(|s| s.as_str()), Some("leaked-anthropic-key"));
        assert!(!env.contains_key("OPENAI_API_KEY"));
        assert!(!env.contains_key("CLAUDE_TEST_VAR"));

        // Must contain dedicated isolated config dir
        assert_eq!(
            env.get("CLAUDE_CONFIG_DIR").unwrap(),
            "C:\\AppData\\Gravity\\profiles\\test-uuid-1234"
        );
        // Must contain explicitly supplied secret
        assert_eq!(env.get("ANTHROPIC_API_KEY").unwrap(), "legit-secret-key");
        // Must NOT contain codex variables
        assert!(!env.contains_key("CODEX_HOME"));
    }

    #[test]
    fn test_build_env_block_codex_isolation() {
        std::env::set_var("ANTHROPIC_API_KEY", "leaked-anthropic-key");
        std::env::set_var("CODEX_LEAK", "leaked-codex");

        let profile = dummy_profile("codex", "client");
        let env = build_env_block(&profile, Some("openai-key-secret"));

        assert!(!env.contains_key("ANTHROPIC_API_KEY"));
        assert!(!env.contains_key("CLAUDE_CONFIG_DIR"));
        assert!(!env.contains_key("CODEX_LEAK"));

        assert_eq!(
            env.get("CODEX_HOME").unwrap(),
            "C:\\AppData\\Gravity\\profiles\\test-uuid-1234"
        );
        assert_eq!(env.get("OPENAI_API_KEY").unwrap(), "openai-key-secret");
    }

    #[test]
    fn test_build_env_block_preserves_system_paths() {
        let profile = dummy_profile("claude", "work");
        let env = build_env_block(&profile, None);

        // Standard Windows system variables must be preserved
        assert!(env.contains_key("PATH") || env.contains_key("Path"));
    }
}
