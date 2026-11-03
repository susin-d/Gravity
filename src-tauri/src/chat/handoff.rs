use crate::chat::ChatMessage;

/// Rough token estimate used to bound the replay. Four characters per token is
/// deliberately conservative for mixed prose and code.
const CHARS_PER_TOKEN: usize = 4;
pub const HANDOFF_TOKEN_BUDGET: usize = 24_000;

pub struct Handoff {
    pub text: String,
    pub omitted: usize,
}

fn format_message(message: &ChatMessage) -> Option<String> {
    let content = message.content.trim();
    if content.is_empty() {
        return None;
    }
    match message.role.as_str() {
        "user" => Some(format!("User: {content}")),
        "assistant" => Some(format!("Assistant: {content}")),
        "tool" => Some(format!("Tool: {content}")),
        _ => None,
    }
}

/// Build the context preamble used when Gravity cannot resume the vendor's own
/// session (a different account, a new config directory, or a lost session id).
///
/// The first user message is always kept. Recent messages are added newest
/// first until the token budget is exhausted; the rest are replaced with an
/// explicit omission marker so the model knows context is missing.
pub fn build_handoff(messages: &[ChatMessage], carry_context: bool) -> Option<Handoff> {
    if !carry_context {
        return None;
    }

    let entries: Vec<String> = messages.iter().filter_map(format_message).collect();
    if entries.is_empty() {
        return None;
    }

    let has_assistant_context = messages
        .iter()
        .any(|message| message.role == "assistant" && !message.content.trim().is_empty());
    if !has_assistant_context {
        return None;
    }

    let budget_chars = HANDOFF_TOKEN_BUDGET * CHARS_PER_TOKEN;
    let first = entries[0].clone();
    let mut total = first.chars().count();
    let mut kept_recent: Vec<String> = Vec::new();
    let mut omitted = 0;

    for entry in entries.iter().skip(1).rev() {
        let cost = entry.chars().count() + 2;
        if total + cost > budget_chars {
            omitted += 1;
            continue;
        }
        total += cost;
        kept_recent.push(entry.clone());
    }
    kept_recent.reverse();

    let mut transcript = first;
    if omitted > 0 {
        transcript.push_str(&format!(
            "\n\n[{} earlier message{} omitted to fit the context budget]",
            omitted,
            if omitted == 1 { "" } else { "s" }
        ));
    }
    for entry in &kept_recent {
        transcript.push_str("\n\n");
        transcript.push_str(entry);
    }

    let text = format!(
        "You are continuing a conversation that started in a previous Gravity session. \
The transcript below is the context so far. Use it and continue naturally. \
Do not restate the transcript.\n\n<transcript>\n{}\n</transcript>",
        transcript
    );

    Some(Handoff { text, omitted })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            chat_id: "chat".to_string(),
            role: role.to_string(),
            content: content.to_string(),
            meta: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn disabled_carry_context_returns_none() {
        let messages = vec![
            message("user", "hello"),
            message("assistant", "hi"),
            message("user", "next"),
        ];
        assert!(build_handoff(&messages, false).is_none());
    }

    #[test]
    fn no_assistant_context_returns_none() {
        let messages = vec![message("user", "hello")];
        assert!(build_handoff(&messages, true).is_none());
    }

    #[test]
    fn keeps_first_message_and_recent_turns() {
        let messages = vec![
            message("user", "first request"),
            message("assistant", "first answer"),
            message("tool", "Read src/main.rs"),
            message("assistant", "second answer"),
            message("user", "latest question"),
        ];
        let handoff = build_handoff(&messages, true).expect("handoff");
        assert!(handoff.text.contains("User: first request"));
        assert!(handoff.text.contains("Assistant: first answer"));
        assert!(handoff.text.contains("Tool: Read src/main.rs"));
        assert!(handoff.text.contains("Assistant: second answer"));
        assert!(handoff.text.contains("User: latest question"));
        assert_eq!(handoff.omitted, 0);
    }

    #[test]
    fn omits_old_messages_when_over_budget() {
        let huge = "x".repeat(HANDOFF_TOKEN_BUDGET * CHARS_PER_TOKEN);
        let messages = vec![
            message("user", "first request"),
            message("assistant", &huge),
            message("assistant", "recent answer"),
        ];
        let handoff = build_handoff(&messages, true).expect("handoff");
        assert!(handoff.text.contains("User: first request"));
        assert!(handoff.text.contains("Assistant: recent answer"));
        assert!(handoff.text.contains("earlier message"));
        assert_eq!(handoff.omitted, 1);
    }
}
