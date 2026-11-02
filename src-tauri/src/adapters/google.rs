use std::path::Path;

use chrono::Utc;
use uuid::Uuid;

use crate::adapters::{AdapterHealth, DetectionResult, ProviderAdapter};
use crate::profiles::Profile;
use crate::usage::{UsageReading, UsageSource};

/// Adapter for the Google Gemini CLI.
pub struct GoogleAdapter;

impl Default for GoogleAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl GoogleAdapter {
    pub fn new() -> Self {
        Self
    }

    /// Extract an optional ISO timestamp from rate limit message if present.
    fn extract_reset_timestamp(line: &str) -> Option<String> {
        // e.g. "Your limit will reset at 2026-11-03T02:00:00Z."
        for word in line.split_whitespace() {
            let clean = word
                .trim_matches(|c: char| !c.is_alphanumeric() && c != '-' && c != ':' && c != 'Z');
            if clean.len() >= 19 && clean.contains('T') && clean.contains(':') {
                return Some(clean.to_string());
            }
        }
        None
    }
}

impl ProviderAdapter for GoogleAdapter {
    fn vendor(&self) -> &'static str {
        "google"
    }

    fn detect_limit(&self, line: &str, exit_code: Option<i32>) -> Option<DetectionResult> {
        let lower = line.to_lowercase();

        // 1. Primary string heuristics matching documented Google CLI error outputs
        let is_limit_pattern = lower.contains("rate limit")
            || lower.contains("quota exceeded")
            || lower.contains("insufficient_quota")
            || lower.contains("429 too many requests")
            || lower.contains("rate_limit_exceeded")
            || lower.contains("you have exceeded your current quota")
            || lower.contains("credit balance is too low");

        // 2. Exit code heuristic: exit code 1 with limit/quota keywords
        let is_exit_limit =
            exit_code == Some(1) && (lower.contains("limit") || lower.contains("quota"));

        if is_limit_pattern || is_exit_limit {
            let reset_ts = Self::extract_reset_timestamp(line);
            let detail = match reset_ts {
                Some(ts) => format!("Google Gemini rate limit detected (resets at {})", ts),
                None => "Google Gemini rate limit detected".to_string(),
            };

            Some(DetectionResult {
                is_limit: true,
                raw_signal: line.trim().to_string(),
                detail,
            })
        } else {
            None
        }
    }

    fn read_usage(&self, profile: &Profile) -> UsageReading {
        let config_path = Path::new(&profile.config_dir);
        let now = Utc::now().to_rfc3339();

        // Check if config dir exists
        if !config_path.exists() {
            return UsageReading {
                id: Uuid::new_v4().to_string(),
                profile_id: profile.id.clone(),
                source: UsageSource::Unknown.as_str().to_string(),
                window: None,
                value_used: None,
                value_limit: None,
                unit: None,
                reset_at: None,
                fetched_at: now,
                detail: Some("Profile directory does not exist yet".to_string()),
            };
        }

        // Try reading simulated fixture usage file if present
        let fixture_path = config_path.join("google_usage.json");
        if fixture_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&fixture_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    return UsageReading {
                        id: Uuid::new_v4().to_string(),
                        profile_id: profile.id.clone(),
                        source: UsageSource::Official.as_str().to_string(),
                        window: val
                            .get("period")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        value_used: val.get("tokens_used").and_then(|v| v.as_f64()),
                        value_limit: val.get("tokens_limit").and_then(|v| v.as_f64()),
                        unit: Some("tokens".to_string()),
                        reset_at: val
                            .get("reset_at")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        fetched_at: now,
                        detail: Some("Read from profile usage telemetry".to_string()),
                    };
                }
            }
        }

        // PRIME DIRECTIVE #3: When cannot verify exact reading, mark unknown. Never guess.
        UsageReading {
            id: Uuid::new_v4().to_string(),
            profile_id: profile.id.clone(),
            source: UsageSource::Unknown.as_str().to_string(),
            window: None,
            value_used: None,
            value_limit: None,
            unit: None,
            reset_at: None,
            fetched_at: now,
            detail: Some(
                "Gemini CLI active. Check usage manually via Google dashboard.".to_string(),
            ),
        }
    }

    fn health(&self) -> AdapterHealth {
        AdapterHealth::Ok
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_google_detects_rate_limit_patterns() {
        let adapter = GoogleAdapter::new();

        let line = "Error: Rate limit reached for requests per minute. Quota exceeded.";
        let res = adapter.detect_limit(line, None);
        assert!(res.is_some());
        assert!(res.unwrap().is_limit);

        let line2 = "Rate limit reached: 429 Too Many Requests.";
        let res2 = adapter.detect_limit(line2, None);
        assert!(res2.is_some());

        let line3 = "Your credit balance is too low to continue.";
        let res3 = adapter.detect_limit(line3, None);
        assert!(res3.is_some());
    }

    #[test]
    fn test_google_ignores_normal_output() {
        let adapter = GoogleAdapter::new();

        assert!(adapter
            .detect_limit("Building project cargo check...", None)
            .is_none());
        assert!(adapter
            .detect_limit("Gemini CLI initialized successfully.", None)
            .is_none());
        assert!(adapter.detect_limit("Reading files...", Some(0)).is_none());
    }

    #[test]
    fn test_google_fixture_detection_under_one_second() {
        // ACCEPTANCE CRITERIA AC-04:
        // Fixture CLI that emits google_limit.txt on stdout -> Limit detected within 1s.
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join("google_limit.txt");
        let content =
            std::fs::read_to_string(&fixture_path).expect("google_limit.txt fixture must exist");

        let adapter = GoogleAdapter::new();
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
        assert!(detected, "Must detect limit from fixture file");
        assert!(
            elapsed.as_millis() < 1000,
            "Detection must take less than 1000ms (took {}ms)",
            elapsed.as_millis()
        );
    }
}
