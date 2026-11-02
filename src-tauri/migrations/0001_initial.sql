-- Gravity v0.1 — Initial schema
-- All times stored as ISO 8601 text (UTC)

CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,           -- UUID v4
    label       TEXT NOT NULL,              -- human-readable, e.g. "Work"
    vendor      TEXT NOT NULL CHECK (vendor IN ('claude', 'codex')),
    tag         TEXT NOT NULL DEFAULT 'personal' CHECK (tag IN ('personal', 'work', 'client')),
    config_dir  TEXT NOT NULL,              -- %APPDATA%\Gravity\profiles\<id>
    cred_ref    TEXT NOT NULL,              -- keyring key: "gravity:<id>"
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    is_active   INTEGER NOT NULL DEFAULT 1  -- soft-delete flag
);

CREATE TABLE IF NOT EXISTS projects (
    id                  TEXT PRIMARY KEY,
    path                TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    tag                 TEXT NOT NULL DEFAULT 'personal' CHECK (tag IN ('personal', 'work', 'client')),
    auto_switch_enabled INTEGER NOT NULL DEFAULT 0,
    default_profile_id  TEXT REFERENCES profiles(id),
    terminal            TEXT NOT NULL DEFAULT 'auto',   -- auto | wt | powershell
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL REFERENCES profiles(id),
    project_id  TEXT REFERENCES projects(id),
    pid         INTEGER,
    started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ended_at    TEXT,
    exit_code   INTEGER,
    status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ended', 'crashed', 'killed'))
);

CREATE TABLE IF NOT EXISTS usage_readings (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL REFERENCES profiles(id),
    source      TEXT NOT NULL CHECK (source IN ('official', 'estimated', 'unknown')),
    window      TEXT,               -- e.g. "5min", "daily", "monthly"
    value_used  REAL,
    value_limit REAL,
    unit        TEXT,               -- e.g. "tokens", "requests", "dollars"
    reset_at    TEXT,               -- ISO 8601, only if provider gave it
    fetched_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    detail      TEXT                -- raw JSON or human-readable detail
);

CREATE TABLE IF NOT EXISTS limit_events (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    profile_id  TEXT NOT NULL REFERENCES profiles(id),
    detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    source      TEXT NOT NULL,      -- "stdout", "exit_code", "api"
    raw_signal  TEXT,               -- the line or exit code that triggered detection
    detail      TEXT
);

CREATE TABLE IF NOT EXISTS switch_events (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT REFERENCES sessions(id),
    from_profile_id     TEXT NOT NULL REFERENCES profiles(id),
    to_profile_id       TEXT NOT NULL REFERENCES profiles(id),
    project_id          TEXT REFERENCES projects(id),
    reason              TEXT NOT NULL CHECK (reason IN ('manual', 'limit', 'auto')),
    outcome             TEXT NOT NULL CHECK (outcome IN ('completed', 'cancelled', 'confirmed_client_boundary', 'blocked_client_auto', 'no_eligible')),
    new_session_id      TEXT REFERENCES sessions(id),
    switched_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    detail              TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_profile    ON usage_readings(profile_id);
CREATE INDEX IF NOT EXISTS idx_limit_session    ON limit_events(session_id);
CREATE INDEX IF NOT EXISTS idx_switch_project   ON switch_events(project_id);
