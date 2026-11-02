use std::collections::HashMap;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tracing::{info, warn};
use uuid::Uuid;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows::Win32::System::Threading::{
    CreateProcessW, CREATE_NEW_CONSOLE, CREATE_UNICODE_ENVIRONMENT, PROCESS_INFORMATION,
    STARTUPINFOW,
};

use crate::profiles::Profile;

/// Represents an active or historical session in the database.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub profile_id: String,
    pub project_id: Option<String>,
    pub pid: Option<i64>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub exit_code: Option<i64>,
    pub status: String, // "running" | "ended" | "crashed" | "killed"
}

/// RAII wrapper around a Win32 Job Object handle.
/// When dropped, CloseHandle is called; Windows automatically terminates all processes in the job.
pub struct OwnedJobObject(HANDLE);

unsafe impl Send for OwnedJobObject {}
unsafe impl Sync for OwnedJobObject {}

impl OwnedJobObject {
    pub fn new() -> windows::core::Result<Self> {
        unsafe {
            let job = CreateJobObjectW(None, PCWSTR::null())?;

            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )?;

            info!("Created Win32 Job Object with KILL_ON_JOB_CLOSE");
            Ok(Self(job))
        }
    }

    pub fn assign_process(&self, process_handle: HANDLE) -> windows::core::Result<()> {
        unsafe {
            AssignProcessToJobObject(self.0, process_handle)?;
            info!("Assigned child process to Win32 Job Object");
            Ok(())
        }
    }
}

impl Drop for OwnedJobObject {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

/// In-memory manager keeping Job Objects alive for the lifetime of Gravity.
pub struct ProcessManager {
    jobs: Mutex<HashMap<String, Arc<OwnedJobObject>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
        }
    }

    pub fn register_job(&self, session_id: String, job: Arc<OwnedJobObject>) {
        if let Ok(mut lock) = self.jobs.lock() {
            lock.insert(session_id, job);
        }
    }

    pub fn unregister_job(&self, session_id: &str) {
        if let Ok(mut lock) = self.jobs.lock() {
            lock.remove(session_id);
        }
    }
}

/// Detect availability of Windows Terminal (`wt.exe`).
/// Normalizes a Windows path, applying the extended-length `\\?\` prefix when the path
/// exceeds 240 characters (per Win32 MAX_PATH / AC-03 requirement) to support arbitrary deep trees.
pub fn normalize_win32_path(path_str: &str) -> String {
    let trimmed = path_str.trim();
    if trimmed.is_empty() {
        return "C:\\".to_string();
    }

    if trimmed.len() >= 240 && !trimmed.starts_with(r"\\?\") {
        if trimmed.starts_with(r"\\") {
            // UNC path: \\server\share -> \\?\UNC\server\share
            format!(r"\\?\UNC\{}", &trimmed[2..])
        } else if trimmed.chars().nth(1) == Some(':') {
            // Drive-letter path: C:\deep\... -> \\?\C:\deep\...
            format!(r"\\?\{trimmed}")
        } else {
            trimmed.to_string()
        }
    } else {
        trimmed.to_string()
    }
}

pub fn find_windows_terminal() -> Option<PathBuf> {
    // 1. Check PATH
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join("wt.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    // 2. Check standard WindowsApps path
    if let Some(local_app_data) = dirs::data_local_dir() {
        let wt_path = local_app_data
            .join("Microsoft")
            .join("WindowsApps")
            .join("wt.exe");
        if wt_path.exists() {
            return Some(wt_path);
        }
    }

    None
}

/// Convert a key-value environment map into the Win32 UTF-16 environment block format.
/// The format consists of null-terminated `VAR=VAL\0` strings sorted case-insensitively,
/// terminated with an extra `\0`.
pub fn create_unicode_env_block(env: &HashMap<String, String>) -> Vec<u16> {
    let mut entries: Vec<(String, String)> = env.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    // Sort entries case-insensitively as required by Win32 CreateProcess
    entries.sort_by(|a, b| a.0.to_uppercase().cmp(&b.0.to_uppercase()));

    let mut block: Vec<u16> = Vec::new();
    for (k, v) in entries {
        let line = format!("{}={}", k, v);
        block.extend(line.encode_utf16());
        block.push(0); // null terminator for this entry
    }
    block.push(0); // double null terminator for the block
    block
}

/// Convert a Rust string to a wide null-terminated UTF-16 vector.
fn to_wide_chars(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// Options for launching an isolated terminal session.
pub struct SpawnOptions<'a> {
    pub profile: &'a Profile,
    pub project_path: Option<&'a Path>,
    pub project_id: Option<String>,
    pub secret: Option<&'a str>,
    pub custom_command: Option<String>,
}

/// Synchronously launches the process and assigns it to the Win32 Job Object.
/// Kept strictly isolated from async/await boundaries to satisfy Rust's Send requirements.
fn launch_process_in_job(
    job: &OwnedJobObject,
    cmd_line: &str,
    target_dir: &str,
    mut env_block: Vec<u16>,
) -> anyhow::Result<u32> {
    let mut cmd_wide = to_wide_chars(cmd_line);
    let dir_wide = to_wide_chars(target_dir);

    let startup_info = STARTUPINFOW::default();
    let mut process_info = PROCESS_INFORMATION::default();

    let success = unsafe {
        CreateProcessW(
            PCWSTR::null(),
            PWSTR(cmd_wide.as_mut_ptr()),
            None,
            None,
            false,
            CREATE_UNICODE_ENVIRONMENT | CREATE_NEW_CONSOLE,
            Some(env_block.as_mut_ptr() as *const _),
            PCWSTR(dir_wide.as_ptr()),
            &startup_info,
            &mut process_info,
        )
    };

    if let Err(e) = success {
        return Err(anyhow::anyhow!("CreateProcessW failed: {e}"));
    }

    let pid = process_info.dwProcessId;
    info!("Spawned child process with PID {}", pid);

    // Assign child process to Job Object immediately
    if let Err(e) = job.assign_process(process_info.hProcess) {
        warn!("Failed to assign process {} to Job Object: {e}", pid);
    }

    // Clean up process & thread handles (Job Object retains ownership of process group)
    unsafe {
        let _ = CloseHandle(process_info.hThread);
        let _ = CloseHandle(process_info.hProcess);
    }

    Ok(pid)
}

/// Spawn an isolated terminal session bound to a Win32 Job Object.
pub async fn spawn_session(
    pool: &SqlitePool,
    manager: &ProcessManager,
    opts: SpawnOptions<'_>,
) -> anyhow::Result<Session> {
    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // 1. Build sanitized environment block
    let env_map = crate::profiles::build_env_block(opts.profile, opts.secret);
    let env_block = create_unicode_env_block(&env_map);

    // 2. Prepare command line based on vendor and terminal availability
    let cli_cmd = match opts.custom_command {
        Some(cmd) => cmd,
        None => match opts.profile.vendor.as_str() {
            "claude" => "claude".to_string(),
            "codex" => "codex".to_string(),
            _ => "powershell.exe".to_string(),
        },
    };

    let raw_dir = opts
        .project_path
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "C:\\".to_string())
        });
    let target_dir = normalize_win32_path(&raw_dir);

    let (terminal_exe, cmd_line) = match find_windows_terminal() {
        Some(wt_path) => {
            // Windows Terminal available: launch new tab in target dir
            let cmd = format!(
                "\"{}\" -d \"{}\" -- powershell.exe -NoExit -Command \"{}\"",
                wt_path.to_string_lossy(),
                target_dir.replace('"', "\\\""),
                cli_cmd
            );
            (wt_path.to_string_lossy().to_string(), cmd)
        }
        None => {
            // Fallback: PowerShell directly
            warn!("Windows Terminal not found; falling back to powershell.exe");
            let cmd = format!(
                "powershell.exe -NoExit -Command \"Set-Location -LiteralPath '{}'; {}\"",
                target_dir.replace('\'', "''"),
                cli_cmd
            );
            ("powershell.exe".to_string(), cmd)
        }
    };

    info!(
        "Spawning session {} for profile {} using {}",
        session_id, opts.profile.id, terminal_exe
    );

    // 3. Create Win32 Job Object for process isolation
    let job = Arc::new(OwnedJobObject::new().map_err(|e| anyhow::anyhow!("Failed to create Job Object: {e}"))?);

    // 4. Launch child process synchronously
    let pid = launch_process_in_job(&job, &cmd_line, &target_dir, env_block)? as i64;

    // Register job in memory to keep it alive
    manager.register_job(session_id.clone(), job);

    // 5. Record session in SQLite database
    sqlx::query(
        r#"
        INSERT INTO sessions (id, profile_id, project_id, pid, started_at, status)
        VALUES (?1, ?2, ?3, ?4, ?5, 'running')
        "#,
    )
    .bind(&session_id)
    .bind(&opts.profile.id)
    .bind(&opts.project_id)
    .bind(pid)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(Session {
        id: session_id,
        profile_id: opts.profile.id.clone(),
        project_id: opts.project_id,
        pid: Some(pid),
        started_at: now,
        ended_at: None,
        exit_code: None,
        status: "running".to_string(),
    })
}

/// List active and recent sessions.
pub async fn list_sessions(pool: &SqlitePool) -> anyhow::Result<Vec<Session>> {
    let sessions = sqlx::query_as::<_, Session>(
        r#"
        SELECT id, profile_id, project_id, pid, started_at, ended_at, exit_code, status
        FROM sessions
        ORDER BY started_at DESC
        LIMIT 50
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_unicode_env_block() {
        let mut map = HashMap::new();
        map.insert("FOO".to_string(), "bar".to_string());
        map.insert("BAZ".to_string(), "qux".to_string());

        let block = create_unicode_env_block(&map);

        // Convert back to string by splitting by \0
        let s = String::from_utf16_lossy(&block);
        let parts: Vec<&str> = s.split('\0').collect();

        // Must contain sorted entries
        assert_eq!(parts[0], "BAZ=qux");
        assert_eq!(parts[1], "FOO=bar");
        // Must end with double null terminator (represented by empty string after last entry)
        assert_eq!(parts[2], "");
    }

    #[test]
    fn test_job_object_creation() {
        // Must succeed on Windows 10/11
        let job = OwnedJobObject::new();
        assert!(job.is_ok());
    }

    #[test]
    fn test_normalize_win32_path_short_and_spaces() {
        let p = r"C:\My Projects\Client App";
        let norm = normalize_win32_path(p);
        assert_eq!(norm, p);
    }

    #[test]
    fn test_normalize_win32_path_exceeding_260_chars_ac03() {
        // AC-03: Paths exceeding 260 chars must be prefixed with \\?\
        let deep_sub = "sub\\".repeat(60); // 240 chars
        let long_path = format!(r"C:\project\Gravity\{}", deep_sub);
        assert!(long_path.len() > 250);

        let norm = normalize_win32_path(&long_path);
        assert!(norm.starts_with(r"\\?\C:\project\Gravity\"));
    }
}
