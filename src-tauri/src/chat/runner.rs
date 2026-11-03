use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::adapters::find_cli;
use crate::chat::{ChatStreamEvent, LimitSignal, ParsedChunk, ToolRecord, TurnUsage};
use crate::process::{OwnedJobObject, ProcessManager};
use crate::profiles::Profile;

/// Everything one turn needs. Owned so the caller can retry the same turn on a
/// different profile without rebuilding it from the database.
pub struct TurnRequest {
    pub profile: Profile,
    pub prompt: String,
    pub resume: Option<String>,
    pub permission_mode: String,
    pub project_path: Option<String>,
    pub chat_id: String,
}

#[derive(Debug, Default)]
pub struct TurnOutcome {
    pub session_id: Option<String>,
    pub text: String,
    pub usage: Option<TurnUsage>,
    pub tools: Vec<ToolRecord>,
    pub limit: Option<LimitSignal>,
    pub cancelled: bool,
    streamed: bool,
}

/// Vendor-specific arguments. Kept pure so the CLI contract is testable
/// without either CLI installed. `skip_git_repo_check` allows Codex to run
/// outside a Git repository; other vendors ignore it.
fn cli_args(
    vendor: &str,
    permission_mode: &str,
    resume: Option<&str>,
    skip_git_repo_check: bool,
) -> Vec<String> {
    match vendor {
        "claude" => {
            let mut args = vec![
                "-p".to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--verbose".to_string(),
                "--permission-mode".to_string(),
                permission_mode.to_string(),
            ];
            if let Some(id) = resume {
                args.push("--resume".to_string());
                args.push(id.to_string());
            }
            args
        }
        "codex" => {
            let mut args = vec!["exec".to_string()];
            match resume {
                // `exec resume` has no --sandbox flag; pin the sandbox with -c instead.
                Some(id) => args.extend([
                    "resume".to_string(),
                    id.to_string(),
                    "--json".to_string(),
                    "-c".to_string(),
                    format!("sandbox_mode=\"{permission_mode}\""),
                ]),
                None => args.extend([
                    "--json".to_string(),
                    "--sandbox".to_string(),
                    permission_mode.to_string(),
                ]),
            }
            if skip_git_repo_check {
                args.push("--skip-git-repo-check".to_string());
            }
            // `-` reads the prompt from stdin, avoiding command-line length limits.
            args.push("-".to_string());
            args
        }
        _ => Vec::new(),
    }
}

/// Walk upwards looking for a `.git` entry (directory or worktree file).
fn is_inside_git_repo(dir: &Path) -> bool {
    dir.ancestors()
        .any(|ancestor| ancestor.join(".git").exists())
}

/// Per-chat working directory used when the chat has no project. Keeping it
/// stable per chat lets a resumed session pick up the same files.
fn chat_temp_dir(chat_id: &str) -> std::io::Result<std::path::PathBuf> {
    let dir = std::env::temp_dir()
        .join("gravity")
        .join("chats")
        .join(chat_id);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn build_command(cli: &Path) -> Command {
    match crate::adapters::cli_extension(cli).as_str() {
        "cmd" | "bat" => {
            let mut command = Command::new("cmd.exe");
            command.arg("/c").arg(cli);
            command
        }
        "ps1" => {
            let mut command = Command::new("powershell.exe");
            command.arg("-NoProfile").arg("-File").arg(cli);
            command
        }
        _ => Command::new(cli),
    }
}

fn parse_chunk(vendor: &str, line: &str) -> ParsedChunk {
    match vendor {
        "claude" => crate::chat::claude::parse_line(line),
        "codex" => crate::chat::codex::parse_line(line),
        _ => ParsedChunk::default(),
    }
}

fn apply_chunk(
    outcome: &mut TurnOutcome,
    chunk: ParsedChunk,
    emit: &mut impl FnMut(ChatStreamEvent),
) {
    if let Some(id) = chunk.session_id {
        outcome.session_id = Some(id);
    }

    if let Some(delta) = chunk.text_delta {
        outcome.text.push_str(&delta);
        outcome.streamed = true;
        emit(ChatStreamEvent::Delta(delta));
    } else if let Some(text) = chunk.final_text {
        // Consolidated messages repeat text that was already streamed. Only use
        // them when the vendor never emitted incremental deltas.
        if !outcome.streamed {
            outcome.text.push_str(&text);
            outcome.streamed = true;
            emit(ChatStreamEvent::Delta(text));
        }
    }

    if !chunk.tools.is_empty() {
        outcome.tools.extend(chunk.tools.iter().cloned());
        emit(ChatStreamEvent::Tools(chunk.tools));
    }

    if chunk.usage.is_some() {
        outcome.usage = chunk.usage;
    }

    if outcome.limit.is_none() {
        if let Some(limit) = chunk.limit {
            outcome.limit = Some(limit.clone());
            emit(ChatStreamEvent::Limit(limit));
        }
    }
}

/// Run one turn against the vendor CLI and stream parsed output to `emit`.
///
/// The child is placed in a Win32 Job Object keyed by `turn_id`, so cancelling
/// the turn (or Gravity exiting) terminates the whole process tree.
pub async fn run_turn(
    manager: &ProcessManager,
    turn_id: &str,
    request: &TurnRequest,
    mut emit: impl FnMut(ChatStreamEvent),
) -> anyhow::Result<TurnOutcome> {
    let vendor = request.profile.vendor.as_str();
    let cli = find_cli(vendor).ok_or_else(|| anyhow::anyhow!("{vendor} CLI not found on PATH"))?;

    let secret = crate::profiles::get_secret(&request.profile.id)?;
    let env = crate::profiles::build_env_block(&request.profile, secret.as_deref());

    let working_dir = match request.project_path.clone() {
        Some(path) => path,
        None => chat_temp_dir(&request.chat_id)?
            .to_string_lossy()
            .to_string(),
    };
    let skip_git_repo_check = !is_inside_git_repo(Path::new(&working_dir));

    let mut command = build_command(&cli);
    command
        .args(cli_args(
            vendor,
            &request.permission_mode,
            request.resume.as_deref(),
            skip_git_repo_check,
        ))
        .current_dir(&working_dir)
        .env_clear()
        .envs(&env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| anyhow::anyhow!("Failed to start {vendor}: {error}"))?;

    let pid = child
        .id()
        .ok_or_else(|| anyhow::anyhow!("{vendor} started without a process id"))?;

    let job = Arc::new(
        OwnedJobObject::new()
            .map_err(|error| anyhow::anyhow!("Failed to create Job Object: {error}"))?,
    );
    job.assign_pid(pid)
        .map_err(|error| anyhow::anyhow!("Failed to assign {vendor} to Job Object: {error}"))?;
    manager.register_job(turn_id.to_string(), job);

    if let Some(mut stdin) = child.stdin.take() {
        // A broken pipe here means the CLI exited before reading the prompt.
        // The exit status and stderr below carry the real diagnosis.
        let _ = stdin.write_all(request.prompt.as_bytes()).await;
        let _ = stdin.shutdown().await;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow::anyhow!("{vendor} stdout is not piped"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| anyhow::anyhow!("{vendor} stderr is not piped"))?;

    let stderr_task = tokio::spawn(async move {
        let mut buffer = String::new();
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            buffer.push_str(&line);
            buffer.push('\n');
        }
        buffer
    });

    let mut outcome = TurnOutcome::default();
    let mut lines = BufReader::new(stdout).lines();
    while let Some(line) = lines.next_line().await? {
        apply_chunk(&mut outcome, parse_chunk(vendor, &line), &mut emit);
    }

    let status = child.wait().await?;
    let stderr_text = stderr_task.await.unwrap_or_default();
    manager.unregister_job(turn_id);

    if outcome.limit.is_none() {
        for line in stderr_text.lines() {
            let chunk = parse_chunk(vendor, line);
            if chunk.limit.is_some() {
                apply_chunk(&mut outcome, chunk, &mut emit);
                break;
            }
        }
    }

    if manager.take_cancelled(turn_id) {
        outcome.cancelled = true;
        return Ok(outcome);
    }

    if !status.success() && outcome.text.trim().is_empty() && outcome.limit.is_none() {
        let detail = stderr_text.trim();
        return Err(anyhow::anyhow!(if detail.is_empty() {
            format!("{vendor} exited with {status}")
        } else {
            format!("{vendor} exited with {status}: {detail}")
        }));
    }

    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_args_default_to_plan_mode() {
        let args = cli_args("claude", "plan", None, false);
        assert_eq!(
            args,
            vec![
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--permission-mode",
                "plan"
            ]
        );
    }

    #[test]
    fn claude_args_resume_with_session_id() {
        let args = cli_args("claude", "acceptEdits", Some("abc"), false);
        assert_eq!(args[args.len() - 2], "--resume");
        assert_eq!(args[args.len() - 1], "abc");
    }

    #[test]
    fn codex_args_read_prompt_from_stdin() {
        let args = cli_args("codex", "read-only", None, false);
        assert_eq!(args, vec!["exec", "--json", "--sandbox", "read-only", "-"]);
    }

    #[test]
    fn codex_args_skip_git_repo_check_only_outside_git() {
        let args = cli_args("codex", "read-only", None, true);
        assert_eq!(
            args,
            vec![
                "exec",
                "--json",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
                "-"
            ]
        );
    }

    #[test]
    fn codex_resume_pins_sandbox_via_config_override() {
        let args = cli_args("codex", "workspace-write", Some("thread-1"), false);
        assert_eq!(
            args,
            vec![
                "exec",
                "resume",
                "thread-1",
                "--json",
                "-c",
                r#"sandbox_mode="workspace-write""#,
                "-"
            ]
        );
    }

    #[test]
    fn codex_resume_outside_git_also_gets_skip_flag() {
        let args = cli_args("codex", "read-only", Some("thread-1"), true);
        assert_eq!(
            args,
            vec![
                "exec",
                "resume",
                "thread-1",
                "--json",
                "-c",
                r#"sandbox_mode="read-only""#,
                "--skip-git-repo-check",
                "-"
            ]
        );
    }

    #[test]
    fn detects_git_repositories_from_nested_directories() {
        let root = tempfile::tempdir().expect("temp dir");
        let nested = root.path().join("a").join("b");
        std::fs::create_dir_all(&nested).expect("create nested");

        assert!(!is_inside_git_repo(&nested));

        std::fs::create_dir(root.path().join(".git")).expect("create .git");
        assert!(is_inside_git_repo(&nested));
    }

    #[test]
    fn streamed_deltas_win_over_consolidated_text() {
        let mut outcome = TurnOutcome::default();
        let mut events = Vec::new();
        apply_chunk(
            &mut outcome,
            ParsedChunk {
                text_delta: Some("Hel".to_string()),
                ..Default::default()
            },
            &mut |event| events.push(event),
        );
        apply_chunk(
            &mut outcome,
            ParsedChunk {
                text_delta: Some("lo".to_string()),
                final_text: Some("Hello".to_string()),
                ..Default::default()
            },
            &mut |event| events.push(event),
        );

        assert_eq!(outcome.text, "Hello");
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn consolidated_text_is_used_when_vendor_never_streams() {
        let mut outcome = TurnOutcome::default();
        let mut events = Vec::new();
        apply_chunk(
            &mut outcome,
            ParsedChunk {
                final_text: Some("Done".to_string()),
                ..Default::default()
            },
            &mut |event| events.push(event),
        );

        assert_eq!(outcome.text, "Done");
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn limit_is_emitted_once() {
        let mut outcome = TurnOutcome::default();
        let mut events = 0;
        let limit = LimitSignal {
            raw_signal: "429".to_string(),
            detail: "rate limited".to_string(),
        };
        for _ in 0..2 {
            apply_chunk(
                &mut outcome,
                ParsedChunk {
                    limit: Some(limit.clone()),
                    ..Default::default()
                },
                &mut |_| events += 1,
            );
        }

        assert_eq!(events, 1);
        assert!(outcome.limit.is_some());
    }
}
