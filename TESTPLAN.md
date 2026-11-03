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

### Protocol D: Provider Provisioning (New Profile dialog)
Requires a machine with npm and (for full coverage) the provider CLIs installed.
1. Open **Profiles -> New profile**. Both provider cards resolve their state from the real CLI: `Installed · <version>` or `Not installed`. If npm is missing, the card shows the npm requirement notice and no Install button.
2. With `codex`/`claude` absent, click **Install**: a console window opens and runs `npm install -g …`. When it exits, **Check again** flips the card to `Installed`.
3. Create a Codex profile with no key: the dialog switches to **Finish sign-in** and shows **CLI signed in / Not signed in / Unavailable** from `codex login status` run with the profile's `CODEX_HOME`. Claude Code shows `Unavailable` (no verifiable check exists) and never a fabricated status.
4. Click **Sign in in a window**: a console opens running `codex login`. Completing the browser flow, then **Edit profile** shows **CLI signed in**. **Sign out** runs `codex logout` and the badge flips back.
5. **Device code** (Codex): the console prints the code and waits; completing it flips the badge.
6. **API key**: for Codex the key is piped to `codex login --with-api-key`; for Claude Code the key is stored in Windows Credential Manager and `ANTHROPIC_API_KEY` is injected at spawn time.
7. Inspect two Codex profiles' `config.toml`: each contains `cli_auth_credentials_store = "file"` and each profile's `auth.json` lives under its own directory. Signing in to one profile must not sign in to the other.
8. No path can render a `signed_in` badge without the CLI confirming it; any spawn failure surfaces as `Unavailable` with the error text.
