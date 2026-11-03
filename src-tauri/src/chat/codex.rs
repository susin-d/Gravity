use serde_json::Value;

use crate::adapters::ProviderAdapter;
use crate::chat::one_line as chat_one_line;
use crate::chat::{LimitSignal, ParsedChunk, ToolRecord, TurnUsage};

fn detect_limit(text: &str) -> Option<LimitSignal> {
    ProviderAdapter::new()
        .detect_limit(text, None)
        .map(|result| LimitSignal {
            raw_signal: result.raw_signal,
            detail: result.detail,
        })
}

fn tool_from_item(item: &Value) -> Option<ToolRecord> {
    let item_type = item.get("type").and_then(Value::as_str)?;
    match item_type {
        "command_execution" => {
            let command = item
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or("command");
            Some(ToolRecord {
                name: "Bash".to_string(),
                summary: format!("Bash: {}", chat_one_line(command, 140)),
            })
        }
        "file_change" => {
            let paths: Vec<String> = item
                .get("changes")
                .and_then(Value::as_array)
                .map(|changes| {
                    changes
                        .iter()
                        .filter_map(|change| change.get("path").and_then(Value::as_str))
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            let detail = if paths.is_empty() {
                "files changed".to_string()
            } else {
                chat_one_line(&paths.join(", "), 140)
            };
            Some(ToolRecord {
                name: "Edit".to_string(),
                summary: format!("Edit: {detail}"),
            })
        }
        "mcp_tool_call" => {
            let server = item.get("server").and_then(Value::as_str).unwrap_or("mcp");
            let tool = item
                .get("tool")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            Some(ToolRecord {
                name: "MCP".to_string(),
                summary: format!("MCP: {server}/{tool}"),
            })
        }
        "web_search" => {
            let query = item
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or("web search");
            Some(ToolRecord {
                name: "WebSearch".to_string(),
                summary: format!("WebSearch: {}", chat_one_line(query, 140)),
            })
        }
        _ => None,
    }
}

fn usage_from(value: &Value) -> TurnUsage {
    TurnUsage {
        input_tokens: value.get("input_tokens").and_then(Value::as_i64),
        output_tokens: value.get("output_tokens").and_then(Value::as_i64),
        cache_read_tokens: value.get("cached_input_tokens").and_then(Value::as_i64),
        cache_write_tokens: None,
        cost_usd: None,
    }
}

fn error_message(value: &Value) -> Option<String> {
    value
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| {
            value
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
        })
        .map(str::to_string)
}

/// Parse one line of `codex exec --json` output.
pub fn parse_line(line: &str) -> ParsedChunk {
    let mut chunk = ParsedChunk::default();
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return chunk;
    }

    let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
        chunk.limit = detect_limit(trimmed);
        return chunk;
    };

    match value.get("type").and_then(Value::as_str) {
        Some("thread.started") => {
            chunk.session_id = value
                .get("thread_id")
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        Some("item.completed") => {
            let item = value.get("item").unwrap_or(&Value::Null);
            match item.get("type").and_then(Value::as_str) {
                Some("agent_message") => {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        if !text.trim().is_empty() {
                            chunk.text_delta = Some(text.to_string());
                            chunk.final_text = Some(text.to_string());
                        }
                    }
                }
                Some("error") => {
                    chunk.limit = detect_limit(trimmed);
                }
                _ => {
                    chunk.tools.extend(tool_from_item(item));
                }
            }
        }
        Some("turn.completed") => {
            let usage = value.get("usage").unwrap_or(&Value::Null);
            let parsed = usage_from(usage);
            if parsed.input_tokens.is_some() || parsed.output_tokens.is_some() {
                chunk.usage = Some(parsed);
            }
        }
        Some("turn.failed") | Some("error") => {
            chunk.limit = detect_limit(trimmed);
            chunk.final_text = error_message(&value);
        }
        _ => {}
    }

    chunk
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_thread_id_and_agent_message() {
        let started = r#"{"type":"thread.started","thread_id":"thread-1"}"#;
        assert_eq!(parse_line(started).session_id.as_deref(), Some("thread-1"));

        let message = r#"{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"Hello"}}"#;
        let chunk = parse_line(message);
        assert_eq!(chunk.text_delta.as_deref(), Some("Hello"));
        assert_eq!(chunk.final_text.as_deref(), Some("Hello"));
    }

    #[test]
    fn captures_command_and_file_tools() {
        let command = r#"{"type":"item.completed","item":{"id":"i1","type":"command_execution","command":"cargo test","status":"completed"}}"#;
        let chunk = parse_line(command);
        assert_eq!(chunk.tools.len(), 1);
        assert_eq!(chunk.tools[0].summary, "Bash: cargo test");

        let file = r#"{"type":"item.completed","item":{"id":"i2","type":"file_change","changes":[{"path":"src/main.rs","kind":"update"}]}}"#;
        let chunk = parse_line(file);
        assert_eq!(chunk.tools[0].summary, "Edit: src/main.rs");
    }

    #[test]
    fn reads_turn_usage() {
        let line = r#"{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":20,"output_tokens":50}}"#;
        let usage = parse_line(line).usage.expect("usage");
        assert_eq!(usage.input_tokens, Some(100));
        assert_eq!(usage.cache_read_tokens, Some(20));
        assert_eq!(usage.output_tokens, Some(50));
    }

    #[test]
    fn detects_error_rate_limit() {
        let line = r#"{"type":"error","message":"Rate limit reached for this account"}"#;
        assert!(parse_line(line).limit.is_some());
    }
}