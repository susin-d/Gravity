/// Sensitive telemetry and secret log scrubber.
///
/// Ensures host secrets, Anthropic API keys, OpenAI API keys, and Authorization headers
/// are never leaked into tracing logs or persistent event descriptions.

pub fn redact_sensitive_str(input: &str) -> String {
    let mut words = Vec::new();
    let mut redact_next = false;

    for word in input.split_whitespace() {
        let lower = word.to_lowercase();

        if redact_next {
            if lower == "bearer" {
                words.push(word.to_string());
                // Redact the token immediately after "Bearer"
                continue;
            }
            words.push("***[REDACTED]***".to_string());
            redact_next = false;
            continue;
        }

        if lower == "bearer" {
            words.push(word.to_string());
            redact_next = true;
            continue;
        }

        if lower.starts_with("authorization:")
            || lower.starts_with("api_key=")
            || lower.starts_with("token=")
        {
            if lower.contains(':') || lower.contains('=') {
                let parts: Vec<&str> = word.splitn(2, [':', '=']).collect();
                if parts.len() == 2 && !parts[1].is_empty() {
                    words.push(format!("{}=***[REDACTED]***", parts[0]));
                    continue;
                }
            }
            words.push(word.to_string());
            redact_next = true;
            continue;
        }

        // Detect Anthropic API keys (e.g. sk-ant-api03-... or sk-ant-...)
        if word.starts_with("sk-ant-") && word.len() > 15 {
            words.push("sk-ant-***[REDACTED]***".to_string());
            continue;
        }

        // Detect OpenAI API keys (e.g. sk-proj-... or sk-...)
        if word.starts_with("sk-") && word.len() > 15 {
            words.push("sk-***[REDACTED]***".to_string());
            continue;
        }

        words.push(word.to_string());
    }

    words.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redacts_anthropic_key() {
        let raw = "Configuring profile with key sk-ant-api03-abcdef1234567890abcdef1234567890 in env";
        let cleaned = redact_sensitive_str(raw);
        assert!(!cleaned.contains("abcdef1234567890"));
        assert!(cleaned.contains("sk-ant-***[REDACTED]***"));
    }

    #[test]
    fn test_redacts_openai_key() {
        let raw = "OpenAI key sk-proj-9876543210abcdef9876543210abcdef ready";
        let cleaned = redact_sensitive_str(raw);
        assert!(!cleaned.contains("9876543210abcdef"));
        assert!(cleaned.contains("sk-***[REDACTED]***"));
    }

    #[test]
    fn test_redacts_bearer_token() {
        let raw = "Header Authorization: Bearer secret_session_token_xyz9876543210";
        let cleaned = redact_sensitive_str(raw);
        assert!(!cleaned.contains("secret_session_token_xyz9876543210"));
        assert!(cleaned.contains("***[REDACTED]***"));
    }

    #[test]
    fn test_preserves_innocent_strings() {
        let raw = "Session started in C:\\project\\Gravity for profile Personal";
        let cleaned = redact_sensitive_str(raw);
        assert_eq!(cleaned, raw);
    }
}
