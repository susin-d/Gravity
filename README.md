# Gravity

> **Native Windows AI CLI Account Manager & Rate Limit Navigator**  
> Manage multiple Claude Code & OpenAI Codex accounts, launch isolated sessions in Windows Terminal, and effortlessly navigate rate limits.

---

## Highlights

- **Clean Isolation:** Each profile gets its own isolated configuration directory (`%APPDATA%\Gravity\profiles\<id>`) and sanitized environment block. No leaking API keys.
- **Zero Zombie Processes:** Every terminal session is bound to a native Windows **Job Object** with `KILL_ON_JOB_CLOSE`. When Gravity shuts down, child processes terminate immediately.
- **Native Windows Security:** Credentials stored securely in **Windows Credential Manager** via DPAPI encryption.
- **Client Boundary Protection:** Tag projects and profiles as `client`. Gravity prevents automated switching into client accounts and prompts with explicit confirmation modals.
- **Truthful Usage Tracking:** Three-state usage readings (`Official`, `Estimated`, `Unknown`). No fake progress bars or imaginary countdowns.
- **Rate Limit Detection:** Proactively detects provider rate limits and guides you to your next available profile in under a second.

---

## Architecture Overview

```
React 18 + Tailwind CSS (WebView2)
           │ (Tauri 2 IPC)
           ▼
    Rust Core Engine (Tokio)
    ├── SQLite (WAL Mode, %APPDATA%\Gravity\gravity.db)
    ├── Windows Credential Manager (keyring)
    ├── Win32 Job Objects (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
    └── Terminal Host (Windows Terminal wt.exe / PowerShell)
```

For complete architectural details, see [ARCHITECTURE.md](file:///c:/project/Gravity/ARCHITECTURE.md).  
For AI Agent guidance, see [AGENTS.md](file:///c:/project/Gravity/AGENTS.md).  
For test procedures, see [TESTPLAN.md](file:///c:/project/Gravity/TESTPLAN.md).

---

## Development Prerequisites

- **OS:** Windows 10 (version 2004+) or Windows 11
- **Rust:** `rustc` & `cargo` 1.80+ (MSVC toolchain)
- **Node.js:** Node v18+ and `pnpm`
- **Windows Terminal:** Recommended (`wt.exe`)

---

## Quickstart

```powershell
# Clone the repository
cd c:\project\Gravity

# Install frontend dependencies
pnpm install

# Run in Tauri development mode
pnpm tauri dev

# Run Rust unit tests
cd src-tauri
cargo test -- --nocapture
```

---

## Milestone Roadmap

- [x] **M0: Skeleton, Tray, Single Instance, SQLite, Settings Shell**
- [ ] **M1: Profiles, Credential Manager, Env Block, CreateProcess, Job Objects, Terminal Launch**
- [ ] **M2: Project Registry, Tags, Per-Project Policy Storage**
- [ ] **M3: Usage Readings, Source Badges, Unknown State**
- [ ] **M4: Provider Adapters (Claude + Codex) & Fixtures**
- [ ] **M5: Limit Toast, New Session, Manual Switch, Client Confirmation Modal**
- [ ] **M6: Auto-Switch (Feature-Flagged behind flags.toml)**
- [ ] **M7: History Timeline, Adapter Health, Polish**

---

## License

This project is licensed under the [MIT License](LICENSE).
