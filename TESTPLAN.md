# Gravity v0.1 — Master Test Plan & Verification Matrix

This document defines the automated test suites and manual verification procedures for Gravity v0.1.
All 12 primary acceptance criteria are mapped to concrete verification steps.

---

## 1. Acceptance Criteria Verification Matrix

| # | Acceptance Criterion | Verification Method | Pass Criteria |
|---|---|---|---|
| **AC-01** | Two profiles, two config dirs, isolated env | Automated Unit Test + Manual Env Dump | Child process prints its environment; only the target profile's `CLAUDE_CONFIG_DIR` or `CODEX_HOME` is present. No host API keys leak. |
| **AC-02** | Closing Gravity terminates child CLI | Manual Windows Task Manager Verification | Launch CLI session via Gravity. Kill Gravity from Task Manager. The CLI process and terminal window immediately terminate via Job Object. |
| **AC-03** | Paths with spaces and >260 characters | Automated Rust Test + Filesystem Test | Projects located in paths with spaces (`C:\My Projects\Client App`) and paths exceeding 260 chars (using `\\?\` prefix) launch without error. |
| **AC-04** | Fixture CLI limit detected in <1s | Automated Integration Test (`fixtures/`) | Feeding `fixtures/claude_limit.txt` into the adapter emits a `limit-detected` event within 1000ms. |
| **AC-05** | "Continue" creates new session without mutating old | Database State Verification | Clicking Continue spawns a new session row. Original session in `sessions` table retains its original state with `status != 'killed'`. |
| **AC-06** | Client project auto-switch control disabled | React Component Test & Manual UI Check | When project has `tag = 'client'`, the auto-switch toggle is disabled (`disabled=true`) with explanatory tooltip. |
| **AC-07** | Client profile move prompts modal; actions logged | Database State Verification | Moving to a client profile displays `ClientBoundaryModal` (default focus on Cancel). Outcome is recorded in `switch_events` as `cancelled` or `confirmed_client_boundary`. |
| **AC-08** | Unknown usage shows no fake bar/number/countdown | React Component & Visual Verification | When `UsageReading.source = 'unknown'`, UI displays "Unknown" badge + "Check manually". No progress bar, 0%, or fabricated timers appear. |
| **AC-09** | Reset countdown rendered only if `reset_at` present | React Component Test | Reading with `reset_at = null` renders no countdown. Reading with valid ISO-8601 timestamp renders live countdown timer. |
| **AC-10** | Auto-switch flag off = zero reachable UI | Frontend Search & Route Verification | When `flags.toml` does not contain `auto_switch = true`, grep for `auto-switch` in UI displays no visible toggles or armed banners. |
| **AC-11** | Every switch logs exactly one `switch_events` row | Database State Verification | Every manual or automated switch inserts exactly 1 row in `switch_events` with matching `from_profile_id`, `to_profile_id`, and `outcome`. |
| **AC-12** | WSL row shows "planned" and is unselectable | Frontend Component Test | In the terminal selector dropdown, the WSL option is disabled with badge "WSL support planned". |

---

## 2. Automated Test Commands

### 2.1 Backend Unit & Integration Tests (Rust)
```powershell
# Run all unit tests
cd c:\project\Gravity\src-tauri
cargo test -- --nocapture

# Run specific feature flag tests
cargo test flags::tests

# Run fixture rate limit detection tests (M4)
cargo test adapters::claude::tests
```

### 2.2 Frontend Static Analysis & Type Checking
```powershell
# Verify TypeScript typing
cd c:\project\Gravity
pnpm tsc --noEmit

# Verify Vite production asset bundling
pnpm build
```

---

## 3. Manual Verification Protocols

### Protocol A: Win32 Job Object Kill-on-Close (AC-02)
1. Open PowerShell and launch Gravity:
   ```powershell
   pnpm tauri dev
   ```
2. Spawn a test session for Claude Code or Codex.
3. Open Windows Task Manager (`Ctrl + Shift + Esc`).
4. Locate `Gravity.exe` and note the child `wt.exe` / `powershell.exe` PID.
5. In Task Manager, right-click `Gravity.exe` and select **End Task** (simulate abnormal termination).
6. **Expected Result:** The terminal window and child CLI process immediately disappear. No orphaned background CLI process remains.

### Protocol B: Long Path & Spaces Handling (AC-03)
1. Create a deep directory structure exceeding 260 characters:
   ```powershell
   $path = "c:\project\Gravity\temp_very_long_path_test\" + ("sub\" * 60)
   New-Item -ItemType Directory -Force -Path $path
   ```
2. Create a project pointing to that directory.
3. Launch a session.
4. **Expected Result:** Win32 API handles the `\\?\` UNC path prefix gracefully; terminal launches in the target folder without `PathTooLongException`.

### Protocol C: Client Boundary Security (AC-06 & AC-07)
1. Create Profile A (`tag = 'personal'`) and Profile B (`tag = 'client'`).
2. Create Project X (`tag = 'client'`).
3. Verify that Project X settings show Auto-switch toggle disabled with tooltip: *"Client projects cannot use auto-switch"*.
4. From Project X, manually switch from Profile A to Profile B.
5. Verify modal appears with title *"Move to a client account?"*.
6. Press `Enter` (default button must be **Cancel**).
7. Verify no switch occurs. Inspect SQLite database:
   ```sql
   SELECT outcome FROM switch_events ORDER BY switched_at DESC LIMIT 1;
   -- Must return 'cancelled'
   ```
8. Repeat and explicitly click *"Start new session in Client"*.
9. Inspect SQLite database:
   ```sql
   SELECT outcome FROM switch_events ORDER BY switched_at DESC LIMIT 1;
   -- Must return 'confirmed_client_boundary'
   ```
