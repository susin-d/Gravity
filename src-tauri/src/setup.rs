//! Provider CLI provisioning: detection, installation and sign-in flows for
//! Claude Code and OpenAI Codex. Sign-in is delegated to the CLI itself; Gravity
//! only opens the console or pipes the credential the user typed.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::adapters::{cli_extension, find_cli};
use crate::process::{self, ProcessManager};
use crate::profiles::{self, Profile};
use crate::redact::redact_sensitive_str;

const PROBE_TIMEOUT: Duration = Duration::from_secs(20);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignInStatus {
    SignedIn,
    SignedOut,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderAuthStatus {
    pub status: SignInStatus,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliToolingStatus {
    pub cli: String,
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub npm_available: bool,
    pub detail: String,
}

fn cli_name(vendor: &str) -> Option<&'static str> {
    match vendor {
        "claude" => Some("claude"),
        "codex" => Some("codex"),
        _ => None,
    }
}

fn npm_package(vendor: &str) -> Option<&'static str> {
    match vendor {
        "claude" => Some("@anthropic-ai/claude-code"),
        "codex" => Some("@openai/codex"),
        _ => None,
    }
}

/// Build the real process invocation for a CLI entry point, unwrapping the
/// npm shims Windows produces for globally installed packages.
fn cli_command(path: &Path) -> Command {
    match cli_extension(path).as_str() {
        "cmd" | "bat" => {
            let mut command = Command::new("cmd.exe");
            command.arg("/c").arg(path);
            command
        }
        "ps1" => {
            let mut command = Command::new("powershell.exe");
            command.arg("-NoProfile").arg("-File").arg(path);
            command
        }
        _ => Command::new(path),
    }
}

struct Captured {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

async fn run_captured(
    path: PathBuf,
    args: Vec<String>,
    stdin_payload: Option<Vec<u8>>,
    env: Option<HashMap<String, String>>,
    cwd: Option<String>,
    timeout: Duration,
) -> Result<Captured, String> {
    tokio::task::spawn_blocking(move || {
        run_captured_blocking(
            &path,
            &args,
            stdin_payload.as_deref(),
            env.as_ref(),
            cwd.as_deref(),
            timeout,
        )
    })
    .await
    .map_err(|error| format!("CLI probe task failed: {error}"))?
}

fn run_captured_blocking(
    path: &Path,
    args: &[String],
    stdin_payload: Option<&[u8]>,
    env: Option<&HashMap<String, String>>,
    cwd: Option<&str>,
    timeout: Duration,
) -> Result<Captured, String> {
    let mut command = cli_command(path);
    command
        .args(args)
        .stdin(if stdin_payload.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(env) = env {
        command.env_clear().envs(env);
    }
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start {}: {error}", path.display()))?;

    if let Some(payload) = stdin_payload {
        if let Some(mut pipe) = child.stdin.take() {
            // Secret is piped then the pipe is closed; it is never a CLI argument.
            let _ = pipe.write_all(payload);
            let _ = pipe.flush();
        }
    }

    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture CLI output".to_string())?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture CLI output".to_string())?;

    let stdout_thread = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buffer);
        buffer
    });
    let stderr_thread = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stderr_pipe.read_to_end(&mut buffer);
        buffer
    });

    let deadline = Instant::now() + timeout;
    let (exit_code, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (status.code(), false),
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    break (None, true);
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(format!("Failed to read process status: {error}")),
        }
    };

    let stdout = stdout_thread.join().unwrap_or_default();
    let stderr = stderr_thread.join().unwrap_or_default();

    Ok(Captured {
        exit_code,
        stdout: String::from_utf8_lossy(&stdout).to_string(),
        stderr: String::from_utf8_lossy(&stderr).to_string(),
        timed_out,
    })
}

fn parse_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .map(|token| token.trim_matches(['v', 'V']))
        .find(|token| token.starts_with(|c: char| c.is_ascii_digit()))
        .map(ToString::to_string)
}

fn first_line(text: &str) -> &str {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("")
}

fn truncate(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn unavailable(detail: impl Into<String>) -> ProviderAuthStatus {
    ProviderAuthStatus {
        status: SignInStatus::Unknown,
        detail: detail.into(),
    }
}

pub async fn probe_provider_cli(vendor: &str) -> Result<CliToolingStatus, String> {
    let cli = cli_name(vendor).ok_or_else(|| "Unsupported provider".to_string())?;
    let npm_available = find_cli("npm").is_some();

    let Some(path) = find_cli(cli) else {
        return Ok(CliToolingStatus {
            cli: cli.to_string(),
            installed: false,
            version: None,
            path: None,
            npm_available,
            detail: format!("{cli} not found on PATH"),
        });
    };

    let version = match run_captured(
        path.clone(),
        vec!["--version".to_string()],
        None,
        None,
        None,
        PROBE_TIMEOUT,
    )
    .await
    {
        Ok(captured) if !captured.timed_out => parse_version(&captured.stdout),
        _ => None,
    };

    let detail = match &version {
        Some(version) => format!("{cli} {version}"),
        None => format!("{cli} found"),
    };

    Ok(CliToolingStatus {
        installed: true,
        cli: cli.to_string(),
        version,
        path: Some(path.display().to_string()),
        npm_available,
        detail,
    })
}

async fn get_profile(pool: &SqlitePool, profile_id: &str) -> Result<Profile, String> {
    profiles::get_profile(pool, profile_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Profile not found".to_string())
}

pub async fn provider_auth_status(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<ProviderAuthStatus, String> {
    let profile = get_profile(pool, profile_id).await?;
    auth_status_for(&profile).await
}

async fn auth_status_for(profile: &Profile) -> Result<ProviderAuthStatus, String> {
    match profile.vendor.as_str() {
        // Claude Code has no documented non-interactive sign-in check; reporting
        // one would be guessing.
        "claude" => Ok(unavailable(
            "Claude Code does not expose a verifiable sign-in check.",
        )),
        "codex" => {
            let Some(path) = find_cli("codex") else {
                return Ok(unavailable("codex not found on PATH"));
            };

            let secret = profiles::get_secret(&profile.id).map_err(|error| error.to_string())?;
            let env = profiles::build_env_block(profile, secret.as_deref());

            match run_captured(
                path,
                vec!["login".to_string(), "status".to_string()],
                None,
                Some(env),
                Some(profile.config_dir.clone()),
                PROBE_TIMEOUT,
            )
            .await
            {
                Err(error) => Ok(unavailable(error)),
                Ok(captured) if captured.timed_out => {
                    Ok(unavailable("codex login status timed out"))
                }
                Ok(captured) => Ok(classify_login_status(&captured)),
            }
        }
        other => Err(format!("Unsupported provider: {other}")),
    }
}

fn classify_login_status(captured: &Captured) -> ProviderAuthStatus {
    let line = first_line(&captured.stdout);
    let line = if line.is_empty() {
        first_line(&captured.stderr)
    } else {
        line
    };
    let detail = redact_sensitive_str(&truncate(line, 160));

    match captured.exit_code {
        Some(0) => ProviderAuthStatus {
            status: SignInStatus::SignedIn,
            detail: if detail.is_empty() {
                "Signed in".to_string()
            } else {
                detail
            },
        },
        _ => ProviderAuthStatus {
            status: SignInStatus::SignedOut,
            detail: if detail.is_empty() {
                "Not signed in".to_string()
            } else {
                detail
            },
        },
    }
}

pub async fn spawn_provider_installation(
    manager: &ProcessManager,
    vendor: &str,
) -> Result<String, String> {
    let cli = cli_name(vendor).ok_or_else(|| "Unsupported provider".to_string())?;
    let package = npm_package(vendor).ok_or_else(|| "Unsupported provider".to_string())?;

    if find_cli("npm").is_none() {
        return Err("npm is not on PATH. Install Node.js (which includes npm) from https://nodejs.org, then try again.".to_string());
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("C:\\"));
    let work_dir = process::normalize_win32_path(&home.to_string_lossy());
    let inner_ps = format!("npm install -g {package}");
    let env = profiles::sanitized_parent_env();

    process::spawn_visible_console(
        manager,
        format!("install:{}", uuid::Uuid::new_v4()),
        &inner_ps,
        &work_dir,
        &env,
    )
    .map_err(|error| error.to_string())?;

    Ok(format!("Installing {cli} in a console window"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoginMethod {
    SignIn,
    DeviceAuth,
}

fn login_command(vendor: &str, method: &LoginMethod) -> Result<String, String> {
    match (vendor, method) {
        ("codex", LoginMethod::SignIn) => Ok("codex login".to_string()),
        ("codex", LoginMethod::DeviceAuth) => Ok("codex login --device-auth".to_string()),
        ("claude", LoginMethod::SignIn) => Ok("claude".to_string()),
        ("claude", LoginMethod::DeviceAuth) => {
            Err("Device code sign-in is only available for OpenAI Codex.".to_string())
        }
        (other, _) => Err(format!("Unsupported provider: {other}")),
    }
}

pub async fn spawn_provider_login(
    manager: &ProcessManager,
    pool: &SqlitePool,
    profile_id: &str,
    method: LoginMethod,
) -> Result<String, String> {
    let profile = get_profile(pool, profile_id).await?;
    let inner_ps = login_command(&profile.vendor, &method)?;

    // No API key is injected: this flow is the CLI's own sign-in.
    let env = profiles::build_env_block(&profile, None);
    let work_dir = process::normalize_win32_path(&profile.config_dir);

    process::spawn_visible_console(
        manager,
        format!("login:{}", uuid::Uuid::new_v4()),
        &inner_ps,
        &work_dir,
        &env,
    )
    .map_err(|error| error.to_string())?;

    Ok("Sign-in opened in a console window".to_string())
}

pub async fn sign_in_with_api_key(
    pool: &SqlitePool,
    profile_id: &str,
    api_key: &str,
) -> Result<ProviderAuthStatus, String> {
    let key = api_key.trim().to_string();
    if key.is_empty() {
        return Err("Enter an API key.".to_string());
    }

    let profile = get_profile(pool, profile_id).await?;

    match profile.vendor.as_str() {
        "codex" => {
            let Some(path) = find_cli("codex") else {
                return Err("codex not found on PATH".to_string());
            };
            let env = profiles::build_env_block(&profile, None);

            match run_captured(
                path,
                vec!["login".to_string(), "--with-api-key".to_string()],
                Some(key.into_bytes()),
                Some(env),
                Some(profile.config_dir.clone()),
                LOGIN_TIMEOUT,
            )
            .await
            {
                Err(error) => Err(error),
                Ok(captured) if captured.timed_out => {
                    Err("codex login timed out while exchanging the API key.".to_string())
                }
                Ok(captured) if captured.exit_code == Some(0) => auth_status_for(&profile).await,
                Ok(captured) => {
                    let line = first_line(&captured.stderr);
                    let line = if line.is_empty() {
                        first_line(&captured.stdout)
                    } else {
                        line
                    };
                    let detail = redact_sensitive_str(&truncate(line, 300));
                    Err(format!(
                        "Codex rejected the API key (exit code {}). {}",
                        captured
                            .exit_code
                            .map(|code| code.to_string())
                            .unwrap_or_else(|| "unknown".to_string()),
                        detail
                    ))
                }
            }
        }
        // Claude Code has no stdin-based API-key login; the key stays in
        // Windows Credential Manager and is injected as ANTHROPIC_API_KEY.
        "claude" => {
            profiles::store_secret(&profile.id, &key).map_err(|error| error.to_string())?;
            Ok(unavailable("Stored in Windows Credential Manager."))
        }
        other => Err(format!("Unsupported provider: {other}")),
    }
}

pub async fn sign_out_provider(
    pool: &SqlitePool,
    profile_id: &str,
) -> Result<ProviderAuthStatus, String> {
    let profile = get_profile(pool, profile_id).await?;

    match profile.vendor.as_str() {
        "codex" => {
            let Some(path) = find_cli("codex") else {
                return Err("codex not found on PATH".to_string());
            };
            let env = profiles::build_env_block(&profile, None);

            match run_captured(
                path,
                vec!["logout".to_string()],
                None,
                Some(env),
                Some(profile.config_dir.clone()),
                PROBE_TIMEOUT,
            )
            .await
            {
                Err(error) => Err(error),
                Ok(captured) if captured.timed_out => Err("codex logout timed out".to_string()),
                Ok(_) => auth_status_for(&profile).await,
            }
        }
        "claude" => Err("Claude Code signs out from inside the CLI with /logout.".to_string()),
        other => Err(format!("Unsupported provider: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_version_from_mixed_output() {
        assert_eq!(
            parse_version("codex-cli 0.84.1\n").as_deref(),
            Some("0.84.1")
        );
        assert_eq!(
            parse_version("Claude Code 1.0.34").as_deref(),
            Some("1.0.34")
        );
        assert_eq!(parse_version("v2.3.4").as_deref(), Some("2.3.4"));
        assert_eq!(parse_version("no version here"), None);
    }

    #[test]
    fn classifies_exit_codes() {
        let captured = Captured {
            exit_code: Some(0),
            stdout: "Logged in using ChatGPT\n".to_string(),
            stderr: String::new(),
            timed_out: false,
        };
        let status = classify_login_status(&captured);
        assert_eq!(status.status, SignInStatus::SignedIn);
        assert_eq!(status.detail, "Logged in using ChatGPT");

        let captured = Captured {
            exit_code: Some(1),
            stdout: String::new(),
            stderr: "Not logged in".to_string(),
            timed_out: false,
        };
        let status = classify_login_status(&captured);
        assert_eq!(status.status, SignInStatus::SignedOut);
        assert_eq!(status.detail, "Not logged in");
    }

    #[test]
    fn detail_falls_back_when_output_is_empty() {
        let captured = Captured {
            exit_code: Some(1),
            stdout: String::new(),
            stderr: String::new(),
            timed_out: false,
        };
        let status = classify_login_status(&captured);
        assert_eq!(status.status, SignInStatus::SignedOut);
        assert_eq!(status.detail, "Not signed in");
    }
}
