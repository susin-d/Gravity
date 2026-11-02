use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{info, warn};

/// Feature flags loaded from `flags.toml` in the app data directory.
/// Missing file or missing keys → defaults (all false).
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct FeatureFlags {
    /// Enable automatic profile switching on rate limit.
    /// Hidden behind flag — no UI path reaches this without editing flags.toml.
    #[serde(default)]
    pub auto_switch: bool,
}

impl FeatureFlags {
    /// Load flags from `<app_data>/flags.toml`. Returns defaults on any error.
    pub fn load(app_data: &Path) -> Self {
        let path = app_data.join("flags.toml");
        match std::fs::read_to_string(&path) {
            Ok(content) => match toml::from_str::<FeatureFlags>(&content) {
                Ok(flags) => {
                    info!("Feature flags loaded from {}", path.display());
                    if flags.auto_switch {
                        warn!("auto_switch flag is ENABLED — auto-switch paths are reachable");
                    }
                    flags
                }
                Err(e) => {
                    warn!("Failed to parse flags.toml: {e}; using defaults");
                    Self::default()
                }
            },
            Err(_) => {
                info!("No flags.toml found; using defaults");
                Self::default()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_missing_file_returns_defaults() {
        let dir = TempDir::new().unwrap();
        let flags = FeatureFlags::load(dir.path());
        assert!(!flags.auto_switch);
    }

    #[test]
    fn test_empty_file_returns_defaults() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("flags.toml"), "").unwrap();
        let flags = FeatureFlags::load(dir.path());
        assert!(!flags.auto_switch);
    }

    #[test]
    fn test_auto_switch_true() {
        let dir = TempDir::new().unwrap();
        let mut f = std::fs::File::create(dir.path().join("flags.toml")).unwrap();
        writeln!(f, "auto_switch = true").unwrap();
        let flags = FeatureFlags::load(dir.path());
        assert!(flags.auto_switch);
    }

    #[test]
    fn test_malformed_file_returns_defaults() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("flags.toml"), "not valid {{toml}}").unwrap();
        let flags = FeatureFlags::load(dir.path());
        assert!(!flags.auto_switch);
    }
}
