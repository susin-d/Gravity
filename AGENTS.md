# AGENTS.md — Agent Operations & Context Guide

> **Project:** Gravity (`c:\project\Gravity`)  
> **Target OS:** Windows 10/11 (Native Win32 + Tauri 2)  
> **Purpose:** AI CLI Account Switcher & Rate Limit Navigator (Claude Code + OpenAI Codex)

---

## 1. Prime Directive for AI Agents

When working on this codebase:
1. **Never violate Windows isolation boundaries:**
   - Environment blocks MUST be sanitized (`build_env_block` in `profiles.rs` must strip all `ANTHROPIC_*`, `OPENAI_*`, `CLAUDE_*`, `CODEX_*` from the parent process environment).
   - Only supply vendor-explicit variables (`CLAUDE_CONFIG_DIR` or `CODEX_HOME`) pointing to `%APPDATA%\Gravity\profiles\<id>`.
2. **Never leave orphan processes:**
   - Every spawned CLI session MUST be placed into a Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
   - If Gravity terminates or crashes, the Windows kernel kills all child CLI processes.
3. **Never guess usage readings:**
   - Readings have a strict discriminator: `official` | `estimated` | `unknown`.
   - If an adapter cannot verify an exact reading, mark it `unknown`.
   - Never show a fake progress bar, 0%, or fabricated reset countdown.
4. **Never expose Auto-Switch without explicit consent and flag:**
   - The `auto_switch` capability (M6) MUST remain guarded by `flags.toml` (`auto_switch = true`).
   - If the flag is absent or false, no UI component or navigation path may expose auto-switch options.
   - Client-tagged projects (`tag == 'client'`) CANNOT be auto-switched under any circumstance.
5. **Always stop at Milestone boundaries:**
   - Stop and report status, Windows-verified checks, and open questions before moving to the next milestone.
6. **Feature Branching & Merge Discipline:**
   - When implementing any new feature or milestone work, ALWAYS create a dedicated git branch (e.g. `feat/<feature-name>` or `milestone/m<N>-<name>`).
   - Never develop or commit feature changes directly on `master`.
   - Once the feature is fully implemented, all verification checks pass (`cargo check`, `cargo test`, `pnpm tsc --noEmit`), and acceptance criteria are met, merge the feature branch back into `master` and clean up the feature branch.

---

## 2. Technology Stack & Key Crates

| Area | Choice | Version / Notes |
|---|---|---|
| **App Framework** | Tauri 2 | `tauri = "^2"`, `tauri-plugin-shell = "^2"` |
| **Frontend** | React 18 + TypeScript 5 | Tailwind CSS 3, Vite 6 |
| **Backend** | Rust (2021 edition) | Tokio async runtime |
| **Database** | SQLite via `sqlx` | Version 0.8 with `runtime-tokio`, compile-time migrations |
| **Secrets / Keys** | Windows Credential Manager | `keyring` crate (service: `gravity:<id>`) |
| **Process / Job API** | Win32 API via `windows` crate | `0.58` (`Win32_System_Threading`, `Win32_System_JobObjects`) |
| **Configuration** | TOML | `toml` crate (`flags.toml` in `%APPDATA%\Gravity`) |

---

## 3. Directory Structure

```
c:\project\Gravity\
├── .git/
├── AGENTS.md                 ← This file: Agent operational manual
├── ARCHITECTURE.md           ← Complete technical & architectural spec
├── TESTPLAN.md               ← 12 acceptance criteria & verification scripts
├── DECISIONS.md              ← Locked decisions from /grill-me
├── README.md                 ← Developer and user guide
├── package.json              ← Frontend dependencies & Tauri scripts
├── vite.config.ts            ← Vite bundler configuration
├── tailwind.config.ts        ← Tailwind CSS tokens and themes
├── tsconfig.json             ← TypeScript strict configuration
├── src/                      ← React Frontend
│   ├── App.tsx               ← Main layout, sidebar navigation, shell
│   ├── main.tsx              ← React root mount
│   ├── index.css             ← Tailwind directives & custom drag regions
│   ├── components/           ← Reusable UI components
│   │   ├── UsageBadge.tsx    ← Official/Estimated/Unknown usage badges
│   │   ├── LimitToast.tsx    ← Non-blocking rate limit notification
│   │   ├── ClientBoundaryModal.tsx ← Modal for entering/leaving client profiles
│   │   └── AutoSwitchBanner.tsx    ← Armed/Triggered banner for auto-switch
│   └── pages/                ← Views
│       ├── Settings.tsx      ← Database location, feature flags status
│       ├── Projects.tsx      ← Project registry, tag assigner, terminal picker
│       ├── History.tsx       ← Audit timeline of sessions, limits, and switches
│       ├── AdapterHealth.tsx ← Health status of Claude & Codex adapters
│       └── AutoSwitchConsent.tsx ← M6 flag-gated allowlist consent screen
└── src-tauri/                ← Rust Backend
    ├── Cargo.toml            ← Rust manifest
    ├── tauri.conf.json       ← Tauri 2 window & tray configuration
    ├── build.rs              ← Tauri build script
    ├── migrations/           ← SQL migrations (embedded in binary)
    │   └── 0001_initial.sql  ← Complete 6-table schema
    ├── fixtures/             ← Mock CLI outputs for test suites
    │   ├── claude_limit.txt
    │   ├── claude_usage.json
    │   ├── codex_limit.txt
    │   └── codex_usage.json
    └── src/
        ├── main.rs           ← Binary entrypoint (calls gravity_lib::run)
        ├── lib.rs            ← Library entrypoint, AppState, Tauri setup
        ├── commands.rs       ← Tauri IPC command definitions
        ├── db.rs             ← SqlitePool wrapper & auto-migration
        ├── flags.rs          ← FeatureFlags loader (flags.toml)
        ├── single_instance.rs← Global\GravityApp named mutex
        ├── profiles.rs       ← Profile management, config dir, env block
        ├── projects.rs       ← Project registry, tags, auto-switch policies
        ├── process.rs        ← Win32 CreateProcessW, Job Object limits, wt/ps fallback
        ├── usage.rs          ← Usage readings and source tracking
        ├── switching.rs      ← Switch event execution and audit logging
        ├── auto_switch.rs    ← M6 flag-gated automated policy engine
        └── adapters/         ← Provider integration
            ├── mod.rs        ← ProviderAdapter trait
            ├── claude.rs     ← Claude Code CLI parser & detector
            └── codex.rs      ← OpenAI Codex CLI parser & detector
```

---

## 4. Milestone Map

- **M0: Skeleton, Tray, Single Instance, SQLite, Settings Shell** *(Current)*
  - Global named mutex `Global\GravityApp`.
  - SQLite WAL mode at `%APPDATA%\Gravity\gravity.db`.
  - FeatureFlags loader (`flags.toml`).
  - React + Tailwind settings view showing DB location & flag status.
- **M1: Profiles, Credential Manager, Env Block, CreateProcess, Job Objects, Terminal**
  - Profile directories `%APPDATA%\Gravity\profiles\<id>`.
  - Keyring storage under `gravity:<id>`.
  - Win32 `CreateProcessW` with clean environment block.
  - Win32 Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
  - Terminal launcher: Windows Terminal (`wt.exe`) with fallback to PowerShell.
- **M2: Project Registry, Tags, Per-Project Policy Storage**
  - Projects table with tags (`personal`, `work`, `client`).
  - Strict UI disablement of auto-switch for `client` tag.
- **M3: Usage Readings, Source Badges, Unknown State**
  - Tri-state usage display (`official`, `estimated`, `unknown`).
  - No fake progress bars or fabricated countdowns when unknown.
- **M4: Provider Adapters (Claude + Codex) & Fixtures**
  - Adapters parsing CLI output, exit codes, and usage stats.
  - Fixture tests simulating rate limits under 1s.
- **M5: Limit Toast, New Session, Manual Switch, Client Confirmation Modal**
  - Non-blocking toast with MRU fallback recommendation.
  - Client profile boundary confirmation modal (Cancel is default focus).
  - Every switch recorded in `switch_events`.
- **M6: Auto-Switch (Feature-Flagged)**
  - Gated behind `flags.toml` (`auto_switch = true`).
  - Never auto-switches client-tagged profiles or projects.
- **M7: History Timeline, Adapter Health, Polish**
  - Audit timeline, adapter status indicators, WSL notice ("planned").

---

## 5. Verification Commands

Run these from PowerShell:

```powershell
# Check Rust backend compile
cd c:\project\Gravity\src-tauri
cargo check

# Run unit tests
cargo test -- --nocapture

# Frontend TypeScript check
cd c:\project\Gravity
pnpm tsc --noEmit

# Frontend production build check
pnpm build

# Launch Tauri development mode
pnpm tauri dev
```

---

## 6. Coding Conventions & Safety Rules

1. **Rust Safety:**
   - Keep `unsafe` blocks minimal and strictly documented for Win32 API calls (`CreateJobObjectW`, `SetInformationJobObject`, `AssignProcessToJobObject`, `CreateProcessW`, `CreateMutexW`).
   - Wrap Win32 handles in RAII wrappers (`OwnedHandle` / custom structs with `Drop` calling `CloseHandle`).
2. **SQL Migrations:**
   - Never modify `0001_initial.sql` once deployed. Create incremental `0002_*.sql` migrations.
   - Always run foreign key enforcement (`PRAGMA foreign_keys = ON;`).
3. **Audit Trail:**
   - Every profile switch must write a record to `switch_events` with `reason` and `outcome`.
   - Never mutate or overwrite historical session logs.
4. **Git Branching & Lifecycle:**
   - **Start of Feature/Milestone:** `git checkout -b feat/<name>` (or `milestone/m<N>-<name>`).
   - **Development:** Commit logical incremental units with descriptive semantic messages (`feat: ...`, `fix: ...`, `test: ...`).
   - **Verification:** Run all automated tests on the feature branch.
   - **Completion & Merge:**
     ```powershell
     git checkout master
     git merge --no-ff feat/<name> -m "feat: merge <name> into master"
     git branch -d feat/<name>
     ```
