use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub mod claude;
pub mod codex;
pub mod handoff;
pub mod runner;

// ---- Chat data model ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub vendor: String,
    pub profile_id: String,
    pub project_id: Option<String>,
    pub permission_mode: String,
    pub carry_context: bool,
    pub cli_session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub meta: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatDetail {
    pub chat: Chat,
    pub messages: Vec<ChatMessage>,
}

fn chat_from_row(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<Chat> {
    use sqlx::Row;

    let carry_context: i64 = row.try_get("carry_context")?;
    Ok(Chat {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        vendor: row.try_get("vendor")?,
        profile_id: row.try_get("profile_id")?,
        project_id: row.try_get("project_id")?,
        permission_mode: row.try_get("permission_mode")?,
        carry_context: carry_context != 0,
        cli_session_id: row.try_get("cli_session_id")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

impl Chat {
    pub async fn load(pool: &sqlx::SqlitePool, id: &str) -> anyhow::Result<Option<Chat>> {
        let row = sqlx::query(
            r#"
            SELECT id, title, vendor, profile_id, project_id, permission_mode,
                   carry_context, cli_session_id, created_at, updated_at
            FROM chats WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        row.map(chat_from_row).transpose()
    }

    pub async fn list(pool: &sqlx::SqlitePool) -> anyhow::Result<Vec<Chat>> {
        let rows = sqlx::query(
            r#"
            SELECT id, title, vendor, profile_id, project_id, permission_mode,
                   carry_context, cli_session_id, created_at, updated_at
            FROM chats
            ORDER BY updated_at DESC
            "#,
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(chat_from_row).collect()
    }
}

impl ChatMessage {
    pub async fn list(pool: &sqlx::SqlitePool, chat_id: &str) -> anyhow::Result<Vec<ChatMessage>> {
        use sqlx::Row;

        let rows = sqlx::query(
            r#"
            SELECT id, chat_id, role, content, meta, created_at
            FROM chat_messages
            WHERE chat_id = ?1
            ORDER BY created_at ASC, rowid ASC
            "#,
        )
        .bind(chat_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(ChatMessage {
                    id: row.try_get("id")?,
                    chat_id: row.try_get("chat_id")?,
                    role: row.try_get("role")?,
                    content: row.try_get("content")?,
                    meta: row.try_get("meta")?,
                    created_at: row.try_get("created_at")?,
                })
            })
            .collect()
    }
}

// ---- Parsed stream output ----

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ParsedChunk {
    pub session_id: Option<String>,
    pub text_delta: Option<String>,
    pub final_text: Option<String>,
    pub tools: Vec<ToolRecord>,
    pub usage: Option<TurnUsage>,
    pub limit: Option<LimitSignal>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TurnUsage {
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
    pub cache_write_tokens: Option<i64>,
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolRecord {
    pub name: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimitSignal {
    pub raw_signal: String,
    pub detail: String,
}

// ---- Message append input ----

#[derive(Debug, Clone, Deserialize)]
pub struct AppendMessage {
    pub chat_id: String,
    pub role: String,
    pub content: String,
    pub meta: Option<String>,
}

// Append a message to a chat and persist it.
pub async fn append_message(
    pool: &sqlx::SqlitePool,
    input: &AppendMessage,
) -> anyhow::Result<ChatMessage> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    sqlx::query(
        r#"
        INSERT INTO chat_messages (id, chat_id, role, content, meta, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
    )
    .bind(&id)
    .bind(&input.chat_id)
    .bind(&input.role)
    .bind(&input.content)
    .bind(&input.meta)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(ChatMessage {
        id,
        chat_id: input.chat_id.clone(),
        role: input.role.clone(),
        content: input.content.clone(),
        meta: input.meta.clone(),
        created_at: now,
    })
}

// ---- Tauri streaming events ----

#[derive(Debug, Clone, Serialize)]
pub struct ChatDeltaEvent {
    pub chat_id: String,
    pub turn_id: String,
    pub delta: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatToolEvent {
    pub chat_id: String,
    pub turn_id: String,
    pub tools: Vec<ToolRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatDoneEvent {
    pub chat_id: String,
    pub turn_id: String,
    pub usage: Option<TurnUsage>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatErrorEvent {
    pub chat_id: String,
    pub turn_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatLimitEvent {
    pub chat_id: String,
    pub turn_id: String,
    pub raw_signal: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatSwitchEvent {
    pub chat_id: String,
    pub turn_id: String,
    pub from_profile_id: String,
    pub to_profile_id: String,
    pub detail: String,
}

/// Incremental output produced while a turn is running. The runner emits these
/// to its caller, which forwards them to the frontend as Tauri events.
#[derive(Debug, Clone)]
pub enum ChatStreamEvent {
    Delta(String),
    Tools(Vec<ToolRecord>),
    Limit(LimitSignal),
}

/// Truncate text to max_chars, adding "..." if needed.
pub fn one_line(text: &str, max_chars: usize) -> String {
    let flattened = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flattened.chars().count() <= max_chars {
        flattened
    } else {
        let mut short: String = flattened
            .chars()
            .take(max_chars.saturating_sub(3))
            .collect();
        short.push_str("...");
        short
    }
}

pub const CLAUDE_MODES: &[&str] = &["plan", "acceptEdits", "bypassPermissions"];
pub const CODEX_MODES: &[&str] = &["read-only", "workspace-write", "danger-full-access"];

pub fn permission_modes(vendor: &str) -> &'static [&'static str] {
    match vendor {
        "claude" => CLAUDE_MODES,
        "codex" => CODEX_MODES,
        _ => &[],
    }
}

pub fn default_permission_mode(vendor: &str) -> &'static str {
    match vendor {
        "codex" => "read-only",
        _ => "plan",
    }
}

pub fn validate_permission_mode(vendor: &str, mode: &str) -> anyhow::Result<()> {
    if permission_modes(vendor).contains(&mode) {
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "Permission mode '{mode}' is not valid for {vendor}"
        ))
    }
}

pub fn title_from_prompt(prompt: &str) -> String {
    let line = prompt
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("");
    let trimmed = line.trim();
    if trimmed.chars().count() <= 60 {
        trimmed.to_string()
    } else {
        let mut title: String = trimmed.chars().take(57).collect();
        title.push_str("...");
        title
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE chats (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                vendor          TEXT NOT NULL,
                profile_id      TEXT NOT NULL,
                project_id      TEXT,
                permission_mode TEXT NOT NULL,
                carry_context   INTEGER NOT NULL DEFAULT 1,
                cli_session_id  TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            )
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE chat_messages (
                id          TEXT PRIMARY KEY,
                chat_id     TEXT NOT NULL,
                role        TEXT NOT NULL,
                content     TEXT NOT NULL,
                meta        TEXT,
                created_at  TEXT NOT NULL
            )
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            INSERT INTO chats (id, title, vendor, profile_id, permission_mode, carry_context, created_at, updated_at)
            VALUES ('chat-1', 'New chat', 'claude', 'profile-1', 'plan', 1,
                    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn appends_and_lists_messages_in_order() {
        let pool = setup().await;

        append_message(
            &pool,
            &AppendMessage {
                chat_id: "chat-1".to_string(),
                role: "user".to_string(),
                content: "hello".to_string(),
                meta: None,
            },
        )
        .await
        .unwrap();

        append_message(
            &pool,
            &AppendMessage {
                chat_id: "chat-1".to_string(),
                role: "assistant".to_string(),
                content: "hi".to_string(),
                meta: Some(r#"{"profile_id":"profile-1"}"#.to_string()),
            },
        )
        .await
        .unwrap();

        let messages = ChatMessage::list(&pool, "chat-1").await.unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].content, "hi");
        assert!(messages[1].meta.is_some());
    }

    #[tokio::test]
    async fn loads_chats_with_carry_context() {
        let pool = setup().await;

        let chat = Chat::load(&pool, "chat-1").await.unwrap().expect("chat");
        assert_eq!(chat.title, "New chat");
        assert!(chat.carry_context);
        assert_eq!(Chat::list(&pool).await.unwrap().len(), 1);
    }
}
