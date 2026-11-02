# Gravity — Milestones, Deliverables & Feature Roadmap

> **Project:** Gravity  
> **Status:** Active Implementation (M0 Complete)  
> **Target OS:** Windows 10/11 (Native Win32 + Tauri 2)

---

## 1. Milestone Tracking Dashboard

| Milestone | Focus Area | Status | Target | Primary Deliverables |
|---|---|:---:|---|---|
| **M0** | Core Foundation & Shell | ✅ Complete | v0.1 | Single Instance Mutex, SQLite (WAL), Flags Loader, Settings View |
| **M1** | Profiles, Isolation & Process Engine | 🔄 Next | v0.1 | DPAPI Credential Storage, Clean Env Block, Job Objects, Terminal Spawner |
| **M2** | Project Registry & Tagging | 📋 Planned | v0.1 | Directory Registry, `personal` / `work` / `client` Tags, Policy Storage |
| **M3** | Honest Telemetry & Badges | 📋 Planned | v0.1 | Tri-state Usage (`official`/`estimated`/`unknown`), No fake UI, Reset Timers |
| **M4** | Provider Adapters & Fixtures | 📋 Planned | v0.1 | Claude Code & Codex Output Parsers, <1s Rate Limit Detection, Fixture Suite |
| **M5** | Limit Toast, Session Switch & Modal | 📋 Planned | v0.1 | Non-blocking Toast, MRU Fallback Engine, Client Boundary Consent Modal |
| **M6** | Auto-Switch Policy Engine | 📋 Planned | v0.1 | `flags.toml` Gated Engine, Client Boundary Lockout, Auto-Switch Banners |
| **M7** | Audit History & Final Polish | 📋 Planned | v0.1 | Filterable Timeline, Adapter Health Monitor, Long Path Support (`\\?\`) |
| **v0.2+**| Extended Ecosystem (Backlog) | 💡 Backlog | v0.2+ | WSL Bridge, Headless CLI, Global Hotkeys, Custom Terminals |

---

## 2. v0.1 Milestone Breakdown

### [M0] Skeleton, Tray, Single Instance, SQLite & Settings Shell
- [x] **Global Single-Instance Mutex:** Native Win32 `Global\GravityApp` mutex to prevent duplicate running instances.
- [x] **SQLite Database Layer:** `sqlx 0.8` with SQLite WAL mode and compile-time embedded migrations (`0001_initial.sql`).
- [x] **Feature Flag Loader:** Zero-dependency TOML configuration (`%APPDATA%\Gravity\flags.toml`) defaulting to safe states.
- [x] **Tauri 2 Desktop Shell:** React 18 + TypeScript + Tailwind CSS UI with system tray integration and basic settings inspection.

---

### [M1] Profiles, Credential Manager, Env Block, Win32 Job Objects & Terminal Launch
- [ ] **Profile Directory Manager:**
  - Allocate isolated config directories at `%APPDATA%\Gravity\profiles\<uuid>`.
  - Vendor directory mapping: `CLAUDE_CONFIG_DIR` (Claude) and `CODEX_HOME` (Codex).
- [ ] **Native Credential Security:**
  - Store tokens and API keys in Windows Credential Manager via `keyring` (`service = "gravity:<uuid>"`).
  - DPAPI hardware-backed encryption under user session.
- [ ] **Sanitized Environment Block Generator:**
  - `build_env_block`: Scrub host environment of all `ANTHROPIC_*`, `OPENAI_*`, `CLAUDE_*`, `CODEX_*` variables.
  - Inject only baseline OS paths (`SYSTEMROOT`, `PATH`, `TEMP`) plus the profile's dedicated config path.
- [ ] **Process Lifecycle & Win32 Job Objects:**
  - Spawning via Win32 `CreateProcessW`.
  - Assign processes to Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
  - Zero orphan process guarantee: closing or killing Gravity immediately terminates child CLIs.
- [ ] **Terminal Launcher Hierarchy:**
  - Probe for Windows Terminal (`wt.exe` in `PATH` / WindowsApps).
  - Launch tab in project directory: `wt.exe -d "<path>" -- powershell.exe ...`.
  - Graceful fallback to standalone PowerShell (`powershell.exe`) with one-time notification if `wt.exe` is absent.

---

### [M2] Project Registry, Tags & Per-Project Policy Storage
- [ ] **Project Directory Registry:**
  - Register local folders by path with auto-detected repository names.
  - SQLite tracking in `projects` table.
- [ ] **Data Boundary Tagging:**
  - Tag assignment: `personal` | `work` | `client`.
  - Default profile per project.
- [ ] **Terminal Preference Selection:**
  - Allow per-project override (`auto`, `wt`, `powershell`).
- [ ] **Client Project Guard:**
  - Strict UI disablement: Projects tagged `client` have auto-switch disabled with an immutable explanation tooltip.

---

### [M3] Usage Readings, Source Badges & Honest Telemetry
- [ ] **Tri-State Usage Model:**
  - Strict classification: `official` | `estimated` | `unknown`.
  - Value fields: `value_used`, `value_limit`, `unit`, `reset_at`, `detail`.
- [ ] **Truthful UI Rendering (`UsageBadge.tsx`):**
  - `official`: Green badge with verified metrics.
  - `estimated`: Yellow badge indicating estimated token/request counts.
  - `unknown`: Neutral gray badge + *"Check manually"* prompt + Refresh action.
  - **Negative Constraint:** No `<progress>` bars, 0% defaults, or fabricated countdowns when source is `unknown`.
- [ ] **Reset Countdown Engine:**
  - Only render countdown timer when `reset_at` is an explicit, verified timestamp provided by the upstream adapter.

---

### [M4] Provider Adapters (Claude Code + OpenAI Codex) & Test Fixtures
- [ ] **`ProviderAdapter` Trait:**
  - Async methods: `read_usage()`, `detect_limit(line, exit_code)`, `health()`.
- [ ] **Claude Code Adapter (`adapters/claude.rs`):**
  - Parse CLI outputs, exit codes, and config files.
  - Sub-second rate limit detection on stdout patterns (429, quota exhaustion, token limits).
- [ ] **OpenAI Codex Adapter (`adapters/codex.rs`):**
  - Codex stderr/stdout format parsing and error code mapping.
- [ ] **Deterministic Test Fixtures:**
  - `fixtures/claude_limit.txt` and `fixtures/codex_limit.txt`.
  - Integration tests verifying detection occurs in $< 1000\text{ms}$.

---

### [M5] Limit Toast, Session Switch & Client Confirmation Modal
- [ ] **Non-Blocking Rate Limit Toast (`LimitToast.tsx`):**
  - Surface non-modal notification when rate limit is detected:  
    *"Claude · Work reached its limit. Continue in Claude · Personal?"*
  - Actions: `[Continue]` (default focus), `[Stay]`, `[Details]`.
- [ ] **MRU Fallback Recommendation Engine:**
  - Select Most Recently Used (MRU) non-client profile under the same vendor.
  - If no eligible profile exists, surface *"No eligible profile — Check manually"*.
- [ ] **Client Boundary Modal (`ClientBoundaryModal.tsx`):**
  - Modal displayed whenever a manual switch attempts to enter or exit a `client` profile.
  - Default button focus is strictly **Cancel**.
  - Choices are never remembered; every client boundary switch requires explicit interaction.
- [ ] **Audit Trail (`switch_events`):**
  - Record every switch attempt with reason (`limit`, `manual`) and outcome (`completed`, `cancelled`, `confirmed_client_boundary`).

---

### [M6] Auto-Switch Engine (Feature-Flagged)
- [ ] **Feature Flag Gate:**
  - Hidden behind `flags.toml` (`auto_switch = true`).
  - If flag is absent or false, zero auto-switch UI elements or navigation paths are reachable.
- [ ] **Session Boundary Engine:**
  - Automatically switch only at session/task boundaries when a rate limit halts execution.
- [ ] **Hardened Client Lockout:**
  - Hard failure if project is tagged `client` or target profile is tagged `client` (`outcome = blocked_client_auto`).
- [ ] **Auto-Switch Banners (`AutoSwitchBanner.tsx`):**
  - Armed Banner: *"Auto-switch armed · Claude · Personal"* + 1-click **Disable**.
  - Post-switch Banner: *"Switched to Claude · Personal from Work at 14:02"* + **Switch back**.
- [ ] **Consent & Allowlist Screen (`AutoSwitchConsent.tsx`):**
  - Granular profile selection; client profiles filtered out of allowlists.

---

### [M7] Audit History, Adapter Health & Production Polish
- [ ] **Session & Switch Audit Timeline (`History.tsx`):**
  - Visual chronological timeline of sessions, limits hit, and profile transitions.
  - Filter by project, profile, tag, and date range.
- [ ] **Adapter Health View (`AdapterHealth.tsx`):**
  - Real-time health badges (`ok` vs. `degraded`).
  - Prominent manual switch recommendations when CLI adapters are degraded.
- [ ] **Long Path & UNC Support:**
  - Support paths $> 260$ characters via Win32 extended-length `\\?\` prefix.
- [ ] **Sensitive Data Redaction:**
  - Tracing filter scrubbers to redact keys, tokens, and authorization headers from application logs.
- [ ] **WSL Notice:**
  - Terminal picker displays *"WSL support planned"* as disabled option with tooltip.

---

## 3. Post-v0.1 Feature Backlog (TODO / Future Roadmap)

### 3.1 WSL Bridge (Windows Subsystem for Linux)
- [ ] **Cross-Subsystem Profile Mapping:** Support launching CLI sessions inside WSL distributions (`wsl.exe -d Ubuntu -e claude`).
- [ ] **WSL Path Translation:** Bidirectional path translation via `wslpath` (`C:\project` $\leftrightarrow$ `/mnt/c/project`).
- [ ] **Credential Pass-Through:** Securely forward Windows Credential Manager tokens into WSL environment blocks without saving secrets on Linux filesystems.

### 3.2 Headless CLI & Wrapper Mode
- [ ] **`gravity run` Command:**
  - CLI wrapper: `gravity run --project <name> -- claude`.
  - Automatically applies profile environment and Job Object constraints from the command line.
- [ ] **Shell Hooks:**
  - PowerShell module & bash/zsh completions for rapid profile selection in existing terminals.

### 3.3 Enhanced Terminal Integrations
- [ ] **Additional Terminal Emulators:**
  - Add native support for **WezTerm**, **Alacritty**, **NuShell**, and **Git Bash (mintty)**.
- [ ] **Windows Terminal Tab Coloring:**
  - Color-code terminal tabs based on profile tags (e.g., Red for `client`, Blue for `work`, Green for `personal`).

### 3.4 Budget & Cost Safeguards
- [ ] **Token & Spend Limits:**
  - Allow users to set hard or soft monthly/daily limits per profile or per project.
  - Prompt a warning toast when 80% or 100% of the self-imposed budget is reached.
- [ ] **Cost Aggregation Dashboard:**
  - Visualize cumulative usage cost across Anthropic and OpenAI accounts.

### 3.5 Global Hotkeys & Desktop Enhancements
- [ ] **Global Quick Switcher (`Win + Alt + G`):**
  - Lightweight Spotlight-style command palette to launch or switch CLI sessions from anywhere in Windows.
- [ ] **System Tray Quick Launcher:**
  - Tray context menu with instant 1-click session launch for MRU projects and profiles.

### 3.6 Automated Session Token Refresher
- [ ] **OAuth / Session Re-auth Helper:**
  - Detect expired CLI browser sessions and launch vendor re-authentication flows with auto-capture of refreshed tokens.

---

## 4. Milestone Acceptance Gate Criteria

Before closing any milestone and proceeding to the next:
1. **Compilation Cleanliness:** `cargo check` and `pnpm tsc --noEmit` pass with zero errors.
2. **Automated Verification:** All unit and integration tests for the milestone pass (`cargo test`).
3. **Windows System Verification:** Specific Win32 API behaviors (Job Object destruction, environment block inspection, file locking) verified on native Windows.
4. **Git Branching & Merge Discipline:** Every milestone/feature must be developed on a dedicated branch (`milestone/m<N>-<name>` or `feat/<name>`) and only merged into `master` after passing all criteria.
5. **Commit & Push Discipline:** Clean semantic commits pushed promptly to `origin` (`git push origin <branch>` / `git push origin master`). No changes left uncommitted or unpushed.
