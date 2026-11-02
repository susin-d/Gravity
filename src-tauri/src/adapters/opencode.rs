use std::path::Path;

use chrono::Utc;
use uuid::Uuid;

use crate::adapters::{AdapterHealth, DetectionResult, ProviderAdapter};
use crate::profiles::Profile;
use crate::usage::{UsageReading, UsageSource};

/// Adapter for the OpenCode CLI.
pub struct OpenCodeAdapter;

impl Default for OpenCodeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenCodeAdapter {
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

impl ProviderAdapter for OpenCodeAdapter {
    fn vendor(&self) -> &'static str {
        "opencode"
    }

    fn detect_limit(&self, line: &str, exit_code: Option<i32>) -> Option<DetectionResult> {
        let lower = line.to_lowercase();

        // OpenCode rate limit and quota error patterns
        let is_limit = lower.contains("rate limit reached")
            || lower.contains("insufficient_quota")
            || lower.contains("quota exceeded")
            || lower.contains("exceeded your current quota")
            || lower.contains("429 too many requests")
            || lower.contains("rate_limit_exceeded")
            || (exit_code == Some(1) && (lower.contains("rate") || lower.contains("quota")));

        if is_limit {
            let reset_ts = Self::extract_reset_timestamp(line);
            let detail = match reset_ts {
                Some(ts) => format!("OpenCode rate limit detected (resets at {})", ts),
                None => "OpenCode rate limit / quota exceeded detected".to_string(),
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
        let fixture_path = config_path.join("opencode_usage.json");
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
                        value_used: val.get("requests_used").and_then(|v| v.as_f64()),
                        value_limit: val.get("requests_limit").and_then(|v| v.as_f64()),
                        unit: Some("requests".to_string()),
                        reset_at: val
                            .get("reset_at")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        fetched_at: now,
                        detail: Some("Read from opencode usage telemetry".to_string()),
                    };
                }
            }
        }

        // PRIME DIRECTIVE #3: Unknown state
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
                "OpenCode CLI active. Check usage manually via OpenCode dashboard.".to_string(),
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
    fn test_opencode_detects_rate_limit_patterns() {
        let adapter = OpenCodeAdapter::new();

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
    fn test_opencode_ignores_normal_output() {
        let adapter = OpenCodeAdapter::new();

        assert!(adapter
            .detect_limit("Building project cargo check...", None)
            .is_none());
        assert!(adapter
            .detect_limit("OpenCode initialized successfully.", None)
            .is_none());
        assert!(adapter.detect_limit("Reading files...", Some(0)).is_none());
    }

    #[test]
    fn test_opencode_fixture_detection_under_one_second() {
        let fixture_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join("opencode_limit.txt");
        let content =
            std::fs::read_to_string(&fixture_path).expect("opencode_limit.txt fixture must exist");

        let adapter = OpenCodeAdapter::new();
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
