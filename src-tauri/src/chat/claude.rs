use serde_json::Value;

use crate::adapters::ProviderAdapter;
use crate::chat::{one_line, LimitSignal, ParsedChunk, ToolRecord, TurnUsage};

fn as_i64(value: Option<&Value>) -> Option<i64> {
    value.and_then(Value::as_i64)
}

fn as_f64(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64)
}

pub fn summarize_tool(name: &str, input: &Value) -> String {
    let detail = match name {
        "Read" | "Write" | "Edit" | "NotebookEdit" | "MultiEdit" => {
            input.get("file_path").and_then(Value::as_str)
        }
        "Bash" | "BashOutput" => input.get("command").and_then(Value::as_str),
        "Glob" | "Grep" => input.get("pattern").and_then(Value::as_str),
        "WebFetch" => input.get("url").and_then(Value::as_str),
        "WebSearch" => input.get("query").and_then(Value::as_str),
        "Task" => input.get("description").and_then(Value::as_str),
        "TodoWrite" => Some("updated the todo list"),
        _ => None,
    }
    .or_else(|| {
        input
            .as_object()
            .and_then(|object| object.values().find_map(Value::as_str))
    })
    .unwrap_or("");

    let detail = one_line(detail, 140);
    if detail.is_empty() {
        name.to_string()
    } else {
        format!("{name}: {detail}")
    }
}

fn usage_from(value: &Value) -> TurnUsage {
    TurnUsage {
        input_tokens: as_i64(value.get("input_tokens")),
        output_tokens: as_i64(value.get("output_tokens")),
        cache_read_tokens: as_i64(value.get("cache_read_input_tokens")),
        cache_write_tokens: as_i64(value.get("cache_creation_input_tokens")),
        cost_usd: as_f64(value.get("total_cost_usd")),
    }
}

fn detect_limit(text: &str) -> Option<LimitSignal> {
    crate::adapters::claude::ClaudeAdapter::new()
        .detect_limit(text, None)
        .map(|result| LimitSignal {
            raw_signal: result.raw_signal,
            detail: result.detail,
        })
}

/// Parse one line of `claude --output-format stream-json` output.
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
        Some("system") => {
            let subtype = value.get("subtype").and_then(Value::as_str).unwrap_or("");
            if subtype == "init" {
                chunk.session_id = value
                    .get("session_id")
                    .and_then(Value::as_str)
                    .map(str::to_string);
            } else if subtype == "api_retry" {
                let error = value.get("error").and_then(Value::as_str).unwrap_or("");
                if error.contains("rate_limit") || error.contains("rate limit") {
                    chunk.limit = Some(LimitSignal {
                        raw_signal: trimmed.to_string(),
                        detail: "Claude Code reported a rate limit while retrying".to_string(),
                    });
                }
            } else if subtype == "error" {
                chunk.limit = detect_limit(trimmed);
            }
        }
        Some("stream_event") => {
            let event = value.get("event").unwrap_or(&Value::Null);
            let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");
            if event_type == "content_block_delta" {
                let delta = event.get("delta").unwrap_or(&Value::Null);
                if delta.get("type").and_then(Value::as_str) == Some("text_delta") {
                    chunk.text_delta = delta
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|text| !text.is_empty())
                        .map(str::to_string);
                }
            }
        }
        Some("assistant") => {
            let message = value.get("message").unwrap_or(&Value::Null);
            if let Some(blocks) = message.get("content").and_then(Value::as_array) {
                for block in blocks {
                    match block.get("type").and_then(Value::as_str) {
                        Some("text") => {
                            if let Some(text) = block.get("text").and_then(Value::as_str) {
                                if !text.trim().is_empty() {
                                    chunk.final_text = Some(text.to_string());
                                }
                            }
                        }
                        Some("tool_use") => {
                            let name = block.get("name").and_then(Value::as_str).unwrap_or("Tool");
                            let input = block.get("input").unwrap_or(&Value::Null);
                            chunk.tools.push(ToolRecord {
                                name: name.to_string(),
                                summary: summarize_tool(name, input),
                            });
                        }
                        _ => {}
                    }
                }
            }
        }
        Some("result") => {
            if let Some(session_id) = value.get("session_id").and_then(Value::as_str) {
                chunk.session_id = Some(session_id.to_string());
            }
            let usage = value.get("usage").unwrap_or(&Value::Null);
            let mut parsed = usage_from(usage);
            parsed.cost_usd = as_f64(value.get("total_cost_usd")).or(parsed.cost_usd);
            if parsed.input_tokens.is_some()
                || parsed.output_tokens.is_some()
                || parsed.cost_usd.is_some()
            {
                chunk.usage = Some(parsed);
            }
            if let Some(text) = value.get("result").and_then(Value::as_str) {
                if !text.trim().is_empty() {
                    chunk.final_text = Some(text.to_string());
                }
            }
            let subtype = value.get("subtype").and_then(Value::as_str).unwrap_or("");
            if subtype.starts_with("error") {
                chunk.limit = detect_limit(trimmed);
            }
        }
        Some("error") => {
            chunk.limit = detect_limit(trimmed);
        }
        _ => {}
    }

    chunk
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_session_id_and_text_delta() {
        let init = r#"{"type":"system","subtype":"init","session_id":"abc"}"#;
        assert_eq!(parse_line(init).session_id.as_deref(), Some("abc"));

        let delta = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}"#;
        assert_eq!(parse_line(delta).text_delta.as_deref(), Some("Hello"));
    }

    #[test]
    fn captures_tool_use_and_result_usage() {
        let assistant = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Reading"},{"type":"tool_use","name":"Read","input":{"file_path":"src/main.rs"}}]}}"#;
        let chunk = parse_line(assistant);
        assert_eq!(chunk.final_text.as_deref(), Some("Reading"));
        assert_eq!(chunk.tools.len(), 1);
        assert_eq!(chunk.tools[0].summary, "Read: src/main.rs");

        let result = r#"{"type":"result","subtype":"success","session_id":"abc","result":"Done","total_cost_usd":0.12,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":3}}"#;
        let chunk = parse_line(result);
        assert_eq!(chunk.final_text.as_deref(), Some("Done"));
        let usage = chunk.usage.expect("usage");
        assert_eq!(usage.input_tokens, Some(10));
        assert_eq!(usage.output_tokens, Some(20));
        assert_eq!(usage.cache_read_tokens, Some(3));
        assert_eq!(usage.cost_usd, Some(0.12));
    }

    #[test]
    fn detects_api_retry_rate_limit() {
        let line = r#"{"type":"system","subtype":"api_retry","error":"rate_limit"}"#;
        assert!(parse_line(line).limit.is_some());
    }

    #[test]
    fn ignores_limit_words_inside_assistant_text() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"The docs describe rate limits."}]}}"#;
        assert!(parse_line(line).limit.is_none());
    }

    #[test]
    fn parses_the_stream_fixture_end_to_end() {
        let fixture = include_str!("../../fixtures/claude_stream.jsonl");
        let mut session_id = None;
        let mut text = String::new();
        let mut tools = Vec::new();
        let mut usage = None;

        for line in fixture.lines() {
            let chunk = parse_line(line);
            if let Some(id) = chunk.session_id {
                session_id = Some(id);
            }
            if let Some(delta) = chunk.text_delta {
                text.push_str(&delta);
            }
            tools.extend(chunk.tools);
            if chunk.usage.is_some() {
                usage = chunk.usage;
            }
        }

        assert_eq!(session_id.as_deref(), Some("claude-session-1"));
        assert_eq!(text, "I'll read the file.");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].summary, "Read: src/main.rs");
        let usage = usage.expect("usage");
        assert_eq!(usage.input_tokens, Some(120));
        assert_eq!(usage.output_tokens, Some(45));
    }
}
