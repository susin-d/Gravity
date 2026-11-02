/**
 * Browser Shim & Fallback for Tauri 2 IPC
 *
 * Automatically activates when running in a standard web browser (Chrome, Edge,
 * Antigravity Preview) where window.__TAURI_INTERNALS__ is not injected by the
 * native Tauri WebView2 runtime. Prevents "Cannot read properties of undefined (reading 'invoke')".
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      [key: string]: unknown;
    };
    __GRAVITY_BROWSER_MODE__?: boolean;
  }
}

interface StoredData {
  profiles: Array<{
    id: string;
    label: string;
    vendor: "claude" | "codex";
    tag: "personal" | "work" | "client";
    config_dir: string;
    cred_ref: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  }>;
  projects: Array<{
    id: string;
    path: string;
    name: string;
    tag: "personal" | "work" | "client";
    auto_switch_enabled: number;
    default_profile_id?: string;
    terminal: string;
    created_at: string;
    updated_at: string;
  }>;
  sessions: Array<{
    id: string;
    profile_id: string;
    project_id?: string;
    pid?: number;
    started_at: string;
    status: string;
  }>;
  limits: Array<{
    id: string;
    session_id: string;
    profile_id: string;
    detected_at: string;
    source: string;
    raw_signal: string;
    detail?: string;
  }>;
  switches: Array<{
    id: string;
    session_id: string;
    from_profile_id: string;
    to_profile_id: string;
    triggered_at: string;
    reason: string;
    outcome: string;
    policy_snapshot?: string;
  }>;
}

const STORAGE_KEY = "gravity_browser_preview_data";

function loadStorage(): StoredData {
  const defaultData: StoredData = {
    profiles: [
      {
        id: "prof_claude_personal",
        label: "Claude Personal",
        vendor: "claude",
        tag: "personal",
        config_dir: "%APPDATA%\\Gravity\\profiles\\claude_personal",
        cred_ref: "gravity:claude_personal",
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        updated_at: new Date().toISOString(),
        is_active: 1,
      },
      {
        id: "prof_claude_work",
        label: "Claude Work Team",
        vendor: "claude",
        tag: "work",
        config_dir: "%APPDATA%\\Gravity\\profiles\\claude_work",
        cred_ref: "gravity:claude_work",
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        updated_at: new Date().toISOString(),
        is_active: 1,
      },
      {
        id: "prof_codex_dev",
        label: "OpenAI Codex Dev",
        vendor: "codex",
        tag: "work",
        config_dir: "%APPDATA%\\Gravity\\profiles\\codex_dev",
        cred_ref: "gravity:codex_dev",
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date().toISOString(),
        is_active: 1,
      },
      {
        id: "prof_client_acme",
        label: "Acme Corp Dedicated",
        vendor: "claude",
        tag: "client",
        config_dir: "%APPDATA%\\Gravity\\profiles\\client_acme",
        cred_ref: "gravity:client_acme",
        created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
        updated_at: new Date().toISOString(),
        is_active: 1,
      },
    ],
    projects: [
      {
        id: "proj_gravity",
        name: "Gravity",
        path: "C:\\project\\Gravity",
        tag: "work",
        auto_switch_enabled: 1,
        default_profile_id: "prof_claude_work",
        terminal: "wt",
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "proj_client_portal",
        name: "Acme Client Portal",
        path: "C:\\work\\client-acme",
        tag: "client",
        auto_switch_enabled: 0,
        default_profile_id: "prof_client_acme",
        terminal: "auto",
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    sessions: [
      {
        id: "sess_1",
        profile_id: "prof_claude_work",
        project_id: "proj_gravity",
        pid: 25592,
        started_at: new Date(Date.now() - 3600000).toISOString(),
        status: "running",
      },
    ],
    limits: [
      {
        id: "lim_1",
        session_id: "sess_1",
        profile_id: "prof_claude_work",
        detected_at: new Date(Date.now() - 1800000).toISOString(),
        source: "cli_stderr",
        raw_signal: "429 Too Many Requests (Rate limit reached for model claude-3-7-sonnet)",
        detail: "Standard Claude rate limit window: reset in 45m",
      },
    ],
    switches: [
      {
        id: "sw_1",
        session_id: "sess_1",
        from_profile_id: "prof_claude_work",
        to_profile_id: "prof_claude_personal",
        triggered_at: new Date(Date.now() - 1795000).toISOString(),
        reason: "Rate limit reached on work profile; switched to personal fallback",
        outcome: "success",
        policy_snapshot: '{"auto_switch":true}',
      },
    ],
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
      return defaultData;
    }
    return JSON.parse(raw);
  } catch {
    return defaultData;
  }
}

function saveStorage(data: StoredData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function initTauriShim() {
  if (typeof window === "undefined") return;

  // If running inside native Tauri WebView2 runtime, __TAURI_INTERNALS__ will exist.
  if (window.__TAURI_INTERNALS__?.invoke) {
    return;
  }

  window.__GRAVITY_BROWSER_MODE__ = true;
  console.info(
    "%c[Gravity]%c Running in Browser Preview Mode — Mock Tauri IPC active",
    "color: #818cf8; font-weight: bold;",
    "color: #94a3b8;"
  );

  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
      const db = loadStorage();

      switch (cmd) {
        case "get_version":
          return "0.1.0";

        case "get_settings":
          return {
            app_data_dir: "C:\\Users\\susin\\AppData\\Roaming\\Gravity",
            db_path: "C:\\Users\\susin\\AppData\\Roaming\\Gravity\\gravity.db",
            flags: { auto_switch: false },
          };

        case "list_profiles":
          return db.profiles;

        case "create_profile": {
          const input = args as {
            label: string;
            vendor: "claude" | "codex";
            tag: "personal" | "work" | "client";
            api_key?: string;
          };
          const newProfile = {
            id: `prof_${Date.now()}`,
            label: input.label,
            vendor: input.vendor,
            tag: input.tag,
            config_dir: `%APPDATA%\\Gravity\\profiles\\${input.label.toLowerCase().replace(/\\s+/g, "_")}`,
            cred_ref: `gravity:${input.label.toLowerCase().replace(/\\s+/g, "_")}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_active: 1,
          };
          db.profiles.push(newProfile);
          saveStorage(db);
          return newProfile;
        }

        case "delete_profile": {
          const { id } = args as { id: string };
          db.profiles = db.profiles.filter((p) => p.id !== id);
          saveStorage(db);
          return null;
        }

        case "check_terminal_available":
          return true;

        case "list_sessions":
          return db.sessions;

        case "spawn_session": {
          const { profile_id, project_id } = args as { profile_id: string; project_id?: string };
          const sess = {
            id: `sess_${Date.now()}`,
            profile_id,
            project_id,
            pid: Math.floor(Math.random() * 20000) + 10000,
            started_at: new Date().toISOString(),
            status: "running",
          };
          db.sessions.push(sess);
          saveStorage(db);
          return sess;
        }

        case "list_latest_usages": {
          const usages: Record<string, unknown> = {};
          for (const p of db.profiles) {
            usages[p.id] = {
              source: "official",
              tier: "pro",
              percent_used: p.tag === "work" ? 82 : 35,
              resets_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
              detail: p.tag === "work" ? "Approaching rate limit" : "Healthy quota",
              reading_time: new Date().toISOString(),
            };
          }
          return usages;
        }

        case "get_profile_usage": {
          return {
            source: "official",
            tier: "pro",
            percent_used: 40,
            resets_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            detail: "Healthy quota",
            reading_time: new Date().toISOString(),
          };
        }

        case "record_usage": {
          return {
            source: "official",
            percent_used: 50,
            reading_time: new Date().toISOString(),
          };
        }

        case "list_projects":
          return db.projects;

        case "create_project": {
          const input = args as {
            path: string;
            name: string;
            tag: "personal" | "work" | "client";
            default_profile_id?: string;
            terminal?: string;
          };
          const newProject = {
            id: `proj_${Date.now()}`,
            path: input.path,
            name: input.name,
            tag: input.tag,
            auto_switch_enabled: input.tag === "client" ? 0 : 1,
            default_profile_id: input.default_profile_id,
            terminal: input.terminal || "auto",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          db.projects.push(newProject);
          saveStorage(db);
          return newProject;
        }

        case "update_project":
        case "set_project_auto_switch": {
          const { id, enabled } = args as { id: string; enabled: boolean };
          const p = db.projects.find((proj) => proj.id === id);
          if (p && p.tag !== "client") {
            p.auto_switch_enabled = enabled ? 1 : 0;
            p.updated_at = new Date().toISOString();
            saveStorage(db);
          }
          return p;
        }

        case "delete_project": {
          const { id } = args as { id: string };
          db.projects = db.projects.filter((p) => p.id !== id);
          saveStorage(db);
          return null;
        }

        case "check_adapters_health":
          return {
            claude: "ok",
            codex: "ok",
          };

        case "detect_line_limit": {
          const { line, exit_code } = args as { line: string; exit_code?: number };
          const isLimit =
            /rate[\s_-]?limit|429|exceeded|quota|too many requests/i.test(line) ||
            exit_code === 429;
          return {
            is_limit: isLimit,
            raw_signal: line,
            detail: isLimit ? "Simulated sub-second rate limit heuristic detection" : "Normal log output",
          };
        }

        case "list_limit_events":
          return db.limits;

        case "suggest_fallback_profile": {
          const { current_profile_id } = args as { current_profile_id: string };
          const current = db.profiles.find((p) => p.id === current_profile_id);
          const fallback = db.profiles.find(
            (p) => p.id !== current_profile_id && p.vendor === current?.vendor && p.tag !== "client"
          );
          return fallback || null;
        }

        case "execute_profile_switch": {
          const { target_profile_id, is_auto, reason } = args as {
            session_id: string;
            target_profile_id: string;
            is_auto: boolean;
            reason: string;
          };
          const target = db.profiles.find((p) => p.id === target_profile_id);
          const sw = {
            id: `sw_${Date.now()}`,
            session_id: "sess_mock",
            from_profile_id: "prof_claude_work",
            to_profile_id: target_profile_id,
            triggered_at: new Date().toISOString(),
            reason: reason || (is_auto ? "Auto-switch policy" : "Manual switch"),
            outcome: "success",
            policy_snapshot: '{"auto_switch":true}',
          };
          db.switches.push(sw);
          saveStorage(db);

          return {
            switch_event: sw,
            new_session: {
              id: `sess_${Date.now()}`,
              profile_id: target_profile_id,
              pid: Math.floor(Math.random() * 20000) + 10000,
              started_at: new Date().toISOString(),
              status: "running",
            },
            requires_client_confirmation: target?.tag === "client",
            confirmation_message: target?.tag === "client" ? "Target is a confidential client account" : undefined,
          };
        }

        case "record_switch_cancellation":
          return null;

        case "list_switch_events":
          return db.switches;

        case "trigger_auto_switch": {
          const { session_id, fallback_profile_id } = args as {
            session_id: string;
            fallback_profile_id: string;
          };
          const sw = {
            id: `sw_${Date.now()}`,
            session_id,
            from_profile_id: "prof_claude_work",
            to_profile_id: fallback_profile_id,
            triggered_at: new Date().toISOString(),
            reason: "Simulated auto-switch triggered from UI",
            outcome: "success",
            policy_snapshot: '{"auto_switch":true}',
          };
          db.switches.push(sw);
          saveStorage(db);
          return sw;
        }

        default:
          console.warn(`[Tauri Mock Shim] Unhandled invoke cmd: ${cmd}`, args);
          return null;
      }
    },
  };
}
