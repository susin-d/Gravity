-- Gravity v0.2 — In-app chat

ALTER TABLE sessions ADD COLUMN origin TEXT NOT NULL DEFAULT 'terminal'
    CHECK (origin IN ('terminal', 'chat'));

CREATE TABLE IF NOT EXISTS chats (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    vendor          TEXT NOT NULL CHECK (vendor IN ('claude', 'codex')),
    profile_id      TEXT NOT NULL REFERENCES profiles(id),
    project_id      TEXT REFERENCES projects(id),
    permission_mode TEXT NOT NULL,
    carry_context   INTEGER NOT NULL DEFAULT 1,
    cli_session_id  TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content     TEXT NOT NULL,
    meta        TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);
