use chrono::Utc;
use uuid::Uuid;

use crate::adapters::{probe_health, AdapterHealth, DetectionResult, ProviderAdapter};
use crate::profiles::Profile;
use crate::usage::{UsageReading, UsageSource};

/// Adapter for OpenAI Codex CLI.
#[derive(Default)]
pub struct CodexAdapter;

impl CodexAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl ProviderAdapter for CodexAdapter {
    fn vendor(&self) -> &'static str {
        "codex"
    }

    fn detect_limit(&self, line: &str, exit_code: Option<i32>) -> Option<DetectionResult> {
        let lower = line.to_lowercase();

        // Codex/OpenAI rate limit and quota error patterns
        let is_limit = lower.contains("rate limit reached")
            || lower.contains("insufficient_quota")
            || lower.contains("quota exceeded")
            || lower.contains("exceeded your current quota")
            || lower.contains("429 too many requests")
            || lower.contains("rate_limit_exceeded")
            || (exit_code == Some(1) && (lower.contains("rate") || lower.contains("quota")));

        if is_limit {
            Some(DetectionResult {
                is_limit: true,
                raw_signal: line.trim().to_string(),
                detail: "OpenAI Codex rate limit / quota exceeded detected".to_string(),
            })
        } else {
            None
        }
    }

    fn read_usage(&self, profile: &Profile) -> UsageReading {
        // Gravity launches the CLI in a separate terminal and cannot read its
        // output or the vendor's remote balance. Never guess a reading.
        UsageReading {
            id: Uuid::new_v4().to_string(),
            profile_id: profile.id.clone(),
            source: UsageSource::Unknown.as_str().to_string(),
            window: None,
            value_used: None,
            value_limit: None,
            unit: None,
            reset_at: None,
            fetched_at: Utc::now().to_rfc3339(),
            detail: Some(
                "Gravity cannot read Codex usage automatically. Check the Codex CLI or your OpenAI account."
                    .to_string(),
            ),
        }
    }

    fn health(&self) -> AdapterHealth {
        probe_health("codex")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::time::Instant;

    #[test]
    fn test_codex_detects_rate_limit_patterns() {
        let adapter = CodexAdapter::new();

        let line =
            "openai.RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached'}}";
        let res = adapter.detect_limit(line, None);
        assert!(res.is_some());
        assert!(res.unwrap().is_limit);

        let line2 = "Error: insufficient_quota. Check your plan and billing details.";
        let res2 = adapter.detect_limit(line2, None);
        assert!(res2.is_some());
    }

    #[test]
    fn test_codex_fixture_detection_under_one_second() {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join("codex_limit.txt");
        let content =
            std::fs::read_to_string(&fixture_path).expect("codex_limit.txt fixture must exist");

        let adapter = CodexAdapter::new();
        let start = Instant::now();

        let mut detected = false;
        for line in content.lines() {
            if let Some(res) = adapter.detect_limit(line, None) {
                if res.is_limit {
                    detected = true;
                    break;
                }
            }
        }

        let elapsed = start.elapsed();
        assert!(detected, "Must detect limit from codex fixture file");
        assert!(
            elapsed.as_millis() < 1000,
            "Detection must take less than 1000ms (took {}ms)",
            elapsed.as_millis()
        );
    }
}
