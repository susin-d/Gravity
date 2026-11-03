use std::path::{Path, PathBuf};
use std::process::Command;

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
pub enum AdapterStatus {
    Ok,
    Degraded,
}

/// Result of probing a provider CLI on this machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdapterHealth {
    pub status: AdapterStatus,
    pub detail: String,
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

/// Locate a CLI executable on PATH, including npm shims (`.cmd`, `.bat`, `.ps1`).
pub fn find_cli(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        for ext in ["exe", "cmd", "bat", "ps1"] {
            let candidate = dir.join(format!("{}.{}", name, ext));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
        let bare = dir.join(name);
        if bare.is_file() {
            return Some(bare);
        }
    }
    None
}

/// Lowercase extension of a CLI entry point. npm installs on Windows produce
/// `.cmd`/`.bat` shims that cannot be spawned directly.
pub(crate) fn cli_extension(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Probe a provider CLI instead of assuming it is installed.
pub fn probe_health(name: &str) -> AdapterHealth {
    match find_cli(name) {
        Some(path) => AdapterHealth {
            status: AdapterStatus::Ok,
            detail: format!("Found {}", path.display()),
        },
        None => AdapterHealth {
            status: AdapterStatus::Degraded,
            detail: format!("{} not found on PATH", name),
        },
    }
}

/// Chat-related capabilities of a provider CLI, probed by running its help.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCapabilities {
    pub available: bool,
    pub supports_stream: bool,
    pub supports_permission_mode: bool,
    pub supports_resume: bool,
    pub detail: String,
}

/// Run a CLI's help output, handling npm shims on Windows.
fn read_help(path: &Path, args: &[&str]) -> Option<String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let output = match ext.as_str() {
        "cmd" | "bat" => Command::new("cmd.exe")
            .arg("/c")
            .arg(path)
            .args(args)
            .output()
            .ok()?,
        "ps1" => Command::new("powershell.exe")
            .arg("-NoProfile")
            .arg("-File")
            .arg(path)
            .args(args)
            .output()
            .ok()?,
        _ => Command::new(path).args(args).output().ok()?,
    };

    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Some(text)
}

fn capabilities_from_help(
    help: &str,
    stream_flag: &str,
    permission_flag: &str,
    resume_flag: &str,
) -> (bool, bool, bool) {
    (
        help.contains(stream_flag),
        help.contains(permission_flag),
        help.contains(resume_flag),
    )
}

/// Probe whether a vendor CLI supports the flags Gravity passes for chat.
pub fn probe_chat_capabilities(vendor: &str) -> ChatCapabilities {
    let (cli, help_args, stream_flag, permission_flag, resume_flag) = match vendor {
        "claude" => (
            "claude",
            &["--help"][..],
            "--output-format",
            "--permission-mode",
            "--resume",
        ),
        "codex" => (
            "codex",
            &["exec", "--help"][..],
            "--json",
            "--sandbox",
            "resume",
        ),
        other => {
            return ChatCapabilities {
                available: false,
                supports_stream: false,
                supports_permission_mode: false,
                supports_resume: false,
                detail: format!("Unknown vendor: {other}"),
            };
        }
    };

    let Some(path) = find_cli(cli) else {
        return ChatCapabilities {
            available: false,
            supports_stream: false,
            supports_permission_mode: false,
            supports_resume: false,
            detail: format!("{cli} not found on PATH"),
        };
    };

    let Some(help) = read_help(&path, help_args) else {
        return ChatCapabilities {
            available: true,
            supports_stream: false,
            supports_permission_mode: false,
            supports_resume: false,
            detail: format!("{cli} found at {} but help probe failed", path.display()),
        };
    };

    let (supports_stream, supports_permission_mode, supports_resume) =
        capabilities_from_help(&help, stream_flag, permission_flag, resume_flag);

    ChatCapabilities {
        available: true,
        supports_stream,
        supports_permission_mode,
        supports_resume,
        detail: format!("{cli} found at {}", path.display()),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_flags_are_detected_from_help_text() {
        let help = "Usage: claude [options]\n  --output-format <format>\n  --permission-mode <mode>\n  --resume [session]";
        let (stream, permission, resume) =
            capabilities_from_help(help, "--output-format", "--permission-mode", "--resume");
        assert!(stream);
        assert!(permission);
        assert!(resume);
    }

    #[test]
    fn missing_capability_flags_are_reported() {
        let help = "Usage: codex exec [options]\n  --json";
        let (stream, permission, resume) =
            capabilities_from_help(help, "--json", "--sandbox", "resume");
        assert!(stream);
        assert!(!permission);
        assert!(!resume);
    }

    #[test]
    fn unknown_vendor_is_not_available() {
        let caps = probe_chat_capabilities("nope");
        assert!(!caps.available);
        assert!(!caps.supports_stream);
    }
}
