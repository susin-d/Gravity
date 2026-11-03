# AGENTS.md — Agent Operations & Context Guide

> **Project:** Gravity (`c:\project\Gravity`)  
> **Target OS:** Windows 10/11 (Native Win32 + Tauri 2)  
> **Purpose:** AI CLI Account Switcher & Rate Limit Navigator (Claude Code + OpenAI Codex)

---

## 0. Task Tracking Rules

When working on any new task:
1. **Before starting:** Open `todo.md`, add the task under "In Progress" with an unchecked box, and note what "done" looks like.
2. **After completing:** Mark the task `[x]` under "Completed", move it from "In Progress", and add any follow-up tasks to "Backlog".
3. Never start coding on a task that is not listed in `todo.md`.

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
7. **Always Commit and Push Changes:**
   - Every completed logical unit of work, milestone deliverable, or documentation update MUST be committed with a clean semantic message and pushed immediately to the remote (`git push origin <branch>` / `git push origin master`).
   - Never leave unpushed commits or uncommitted working tree changes when ending a turn.
8. **Never ship slop code:**
   - Every line in the diff must be required by the task, understood by the author, and useful to the next reader.
   - Follow the anti-slop rules in Section 7 before every commit.

---

## 2. Technology Stack & Key Crates

| Area | Choice | Version / Notes |
|---|---|---|
| **App Framework** | Tauri 2 | `tauri = "^2"` |
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
│   │   ├── chat/
│   │   │   └── new-chat-dialog.tsx ← Profile, project, and permission picker
│   │   ├── ui/               ← Badges, buttons, dialogs, fields, toasts
│   │   └── client-boundary-modal.tsx ← Client confirmation before entering or leaving client accounts
│   └── pages/                ← Views
│       ├── Chat.tsx          ← Chat surface, transcript, composer, streaming
│       ├── Profiles.tsx      ← Profile registry and credentials
│       ├── Projects.tsx      ← Project registry and terminal launch
│       ├── Activity.tsx      ← Sessions, limit events, and switch audit
│       └── Settings.tsx      ← Database location and feature flags
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

# Rust formatting (must be clean)
cargo fmt --check

# Rust lints (no new warnings; fix warnings in files you touch)
cargo clippy --all-targets

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
     git push origin master
     ```

---

## 7. Code Quality: Anti-Slop Rules

> Slop is code that exists to look productive instead of doing work. The diff is a cost, not an output. Every line must be required by the task, understood by the author, and readable by the next agent.

### 7.1 Quantity discipline

1. **Delete before you add.** Prefer the change with fewer lines. If a fix can remove a helper, flag, or file, do that instead of layering a new one on top.
2. **No speculative abstraction.** No traits, generics, factories, config keys, or extension points for a single caller. Add the abstraction when the second real use case arrives.
3. **No duplicate implementations.** Search the codebase first (`db.rs`, `profiles.rs`, `process.rs`, `src/components/`). Extend the existing helper instead of copying it.
4. **No dead or half-finished code.** No commented-out blocks, unused exports/imports/dependencies, `todo!()`, placeholder commands, "coming soon" wiring, or scaffolding that only compiles. If it does not run end-to-end, it does not merge.
5. **One responsibility per file.** Do not create a module or component for a single trivial function; put it where its caller lives.
6. **Targeted edits only.** Never reformat, reorder, or rewrite a file to change a few lines. Keep diffs small enough to review hunk by hunk.
7. **No generated noise.** No AI attribution, changelog narration ("updated to...", "as requested"), decorative separators, or emoji in code, comments, commits, or docs.

### 7.2 Comments

- Comments explain **why**, never **what**. If the code needs a comment to describe what it does, rename the code instead.
- Banned: banner/section separators, per-line narration, and doc comments that restate the signature.
- Allowed: `unsafe` justification (required), vendor quirks and workarounds with a link, non-obvious invariants, migration and version constraints.
- Delete a stale comment in the same commit that invalidates it.

### 7.3 Trust boundaries and error handling

- Validate once at the boundary (IPC command, adapter parser, DB read), then pass typed values inward. Do not re-validate in every layer.
- No defensive `try/catch`, `if let Some`, or `Option` gymnastics on internal paths that cannot fail.
- Never swallow failures that matter (process spawn, job object assignment, SQLite writes, keyring, switch audit). Use `?` and a typed error.
- `unwrap()` / `expect()` only for proven invariants (static regex, test fixtures, sealed handles). Never on user input, paths, env vars, or CLI output.
- Never fake success. An unimplemented capability returns `Err` or `unknown` and surfaces it — no mock data on production paths.

### 7.4 Types

- No `any`, `as unknown as`, `!` non-null assertions, `@ts-ignore`, or blanket `#[allow(...)]` to silence a real error. Fix the type or the model.
- Model state as a discriminated union or enum (`official | estimated | unknown`), never as parallel booleans such as `isLoading` + `hasData` + `isError`.
- Prefer exhaustive `match` / `switch`; no catch-all default that hides new variants.

### 7.5 UI

- No fabricated data of any kind: no fake percentages, session counts, reset timers, or seed/sample rows.
- No dead controls. Flag-gated features are **absent**, not disabled stubs (Prime Directive 4).
- Reuse existing components (`UsageBadge`, `LimitToast`, etc.) instead of forking one-off variants.
- Every new component and state needs a reachable user path. Delete components nothing renders.

### 7.6 Pre-commit self-review gate

Walk the diff hunk by hunk before staging and answer:

1. Would a reviewer ask "why is this here?" If yes, delete it or justify it in one line.
2. Does every new function, file, comment, dependency, and flag have a caller today?
3. Did I change behavior the task did not ask for? Revert it.
4. Are all checks in Section 5 green?

Report `git diff --stat` in milestone summaries. Unexplained growth in lines or files gets reverted, not defended.

