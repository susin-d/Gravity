# Gravity — Architecture & Design Decisions (Locked)

This document preserves the architectural constraints, trade-offs, and locked decisions agreed upon during the initial `/grill-me` alignment.

---

## 1. Locked Decisions Table

| Decision Item | Decision | Rationale |
|---|---|---|
| **Client-Safe Isolation Boundary** | Environment-variable level only (`CLAUDE_CONFIG_DIR` / `CODEX_HOME` pointing to separate `%APPDATA%\Gravity\profiles\<id>`). Same Windows OS user. | Windows multi-user isolation requires elevated elevation (UAC prompts) or Windows Service brokers, which introduces unacceptable UX friction for developers running terminal CLIs. |
| **Fallback Target on Rate Limit** | Most Recently Used (MRU) non-client profile for the same vendor. If none available → *"No eligible profile — Check manually"*. | Seamless developer flow without accidental switching across different vendors or into client-restricted profiles. |
| **Auto-Switch Scope in v0.1** | Fully implemented in backend (M6), but strictly gated behind `flags.toml` (`auto_switch = true`). Zero reachable UI by default. | Ensures users do not inadvertently breach AI provider Terms of Service regarding multi-account pooling without reviewing policies first. |
| **Frontend Framework** | Tauri 2 + React 18 + TypeScript + Tailwind CSS. | Lightweight footprint (<50MB memory), native Windows WebView2 rendering, single-executable packaging. |
| **SQLite Driver & Migrations** | `sqlx` (version 0.8) with SQLite feature, WAL mode enabled, embedded compile-time migrations. | High reliability, async Tokio integration, zero runtime migration binary dependencies for end-users. |
| **Process Tree Management** | Win32 Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. | Guaranteed zero orphan CLI processes if Gravity terminates, crashes, or is killed from Task Manager. |
| **Credential Storage** | Windows Credential Manager via `keyring` crate. Key format: `gravity:<profile_uuid>`. | Native Windows encryption tied to user DPAPI credentials; prevents plaintext secret storage in SQLite or disk. |
| **Terminal Integration** | Windows Terminal (`wt.exe`) primary, PowerShell (`powershell.exe`) secondary fallback. | Windows Terminal provides modern multi-tab, GPU-accelerated rendering; graceful fallback ensures it works on all Windows systems. |
| **Usage Honesty (Tri-state)** | Readings must be tagged `official`, `estimated`, or `unknown`. | Never fabricate numbers, percentages, or reset timers. If an adapter cannot verify an exact reading, mark it `unknown`. |

---

## 2. Explicit Non-Goals for v0.1

1. **WSL (Windows Subsystem for Linux) Session Spawning:**
   - WSL file paths (`\\wsl$\...`) and Linux environment variable propagation introduce complex credential boundary issues.
   - Surfaced in UI as *"WSL support planned"* (disabled).
2. **Reverse Proxy / MITM Token Interception:**
   - Gravity will not run a local HTTP proxy to inspect or inject Anthropic/OpenAI API tokens on the wire.
   - All isolation is filesystem and process environment based.
3. **Multi-OS Support (macOS / Linux):**
   - v0.1 is tailored exclusively for native Windows (Win32 Job Objects, Credential Manager, Windows Terminal).
4. **Cloud Sync / Remote Storage:**
   - All profile data and history remain 100% local on the user's machine at `%APPDATA%\Gravity`.
