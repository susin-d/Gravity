use std::collections::HashMap;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tracing::info;
use uuid::Uuid;

/// Tri-state usage telemetry classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageSource {
    Official,
    Estimated,
    Unknown,
}

impl UsageSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Official => "official",
            Self::Estimated => "estimated",
            Self::Unknown => "unknown",
        }
    }

    pub fn parse(s: &str) -> anyhow::Result<Self> {
        match s.to_lowercase().as_str() {
            "official" => Ok(Self::Official),
            "estimated" => Ok(Self::Estimated),
            "unknown" => Ok(Self::Unknown),
            other => Err(anyhow::anyhow!("Invalid usage source: {}", other)),
        }
    }
}

/// Usage reading database model.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UsageReading {
    pub id: String,
    pub profile_id: String,
    pub source: String, // "official" | "estimated" | "unknown"
    pub window: Option<String>,
    pub value_used: Option<f64>,
    pub value_limit: Option<f64>,
    pub unit: Option<String>,
    pub reset_at: Option<String>, // ISO 8601, only if upstream provider gave it
    pub fetched_at: String,
    pub detail: Option<String>,
}

/// Input payload for creating or inserting a usage reading.
#[derive(Debug, Clone, Deserialize)]
pub struct RecordUsageInput {
    pub profile_id: String,
    pub source: String, // "official" | "estimated" | "unknown"
    pub window: Option<String>,
    pub value_used: Option<f64>,
    pub value_limit: Option<f64>,
    pub unit: Option<String>,
    pub reset_at: Option<String>,
    pub detail: Option<String>,
}

/// Record a new usage reading in the SQLite database.
pub async fn record_usage(
    pool: &SqlitePool,
    input: RecordUsageInput,
) -> anyhow::Result<UsageReading> {
    // Validate strict tri-state discriminator
    let validated_source = UsageSource::parse(&input.source)?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // Sanitize reset_at: if empty string, convert to None
    let reset_at = input.reset_at.filter(|s| !s.trim().is_empty());

    sqlx::query(
        r#"
        INSERT INTO usage_readings (id, profile_id, source, window, value_used, value_limit, unit, reset_at, fetched_at, detail)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
    )
    .bind(&id)
    .bind(&input.profile_id)
    .bind(validated_source.as_str())
    .bind(&input.window)
    .bind(input.value_used)
    .bind(input.value_limit)
    .bind(&input.unit)
    .bind(&reset_at)
    .bind(&now)
    .bind(&input.detail)
    .execute(pool)
    .await?;

    info!(
        "Usage recorded for profile {}: source={}, used={:?}, limit={:?}, reset_at={:?}",
        input.profile_id,
        validated_source.as_str(),
        input.value_used,
        input.value_limit,
        reset_at
    );

    Ok(UsageReading {
        id,
        profile_id: input.profile_id,
        source: validated_source.as_str().to_string(),
        window: input.window,
        value_used: input.value_used,
        value_limit: input.value_limit,
        unit: input.unit,
        reset_at,
        fetched_at: now,
        detail: input.detail,
    })
}

/// Fetch the most recent usage reading for a given profile.
pub async fn get_latest_usage(
    pool: &SqlitePool,
    profile_id: &str,
) -> anyhow::Result<Option<UsageReading>> {
    let reading = sqlx::query_as::<_, UsageReading>(
        r#"
        SELECT id, profile_id, source, window, value_used, value_limit, unit, reset_at, fetched_at, detail
        FROM usage_readings
        WHERE profile_id = ?1
        ORDER BY fetched_at DESC
        LIMIT 1
        "#,
    )
    .bind(profile_id)
    .fetch_optional(pool)
    .await?;

    Ok(reading)
}

/// Fetch the latest usage reading for each active profile as a Map keyed by profile_id.
pub async fn list_latest_usages(
    pool: &SqlitePool,
) -> anyhow::Result<HashMap<String, UsageReading>> {
    // SQLite window query: pick latest row per profile_id
    let readings = sqlx::query_as::<_, UsageReading>(
        r#"
        SELECT u.id, u.profile_id, u.source, u.window, u.value_used, u.value_limit, u.unit, u.reset_at, u.fetched_at, u.detail
        FROM usage_readings u
        INNER JOIN (
            SELECT profile_id, MAX(fetched_at) as max_fetched
            FROM usage_readings
            GROUP BY profile_id
        ) latest ON u.profile_id = latest.profile_id AND u.fetched_at = latest.max_fetched
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut map = HashMap::new();
    for r in readings {
        map.insert(r.profile_id.clone(), r);
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE usage_readings (
                id          TEXT PRIMARY KEY,
                profile_id  TEXT NOT NULL,
                source      TEXT NOT NULL CHECK (source IN ('official', 'estimated', 'unknown')),
                window      TEXT,
                value_used  REAL,
                value_limit REAL,
                unit        TEXT,
                reset_at    TEXT,
                fetched_at  TEXT NOT NULL,
                detail      TEXT
            );
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn test_source_validation() {
        assert!(UsageSource::parse("official").is_ok());
        assert!(UsageSource::parse("estimated").is_ok());
        assert!(UsageSource::parse("unknown").is_ok());
        assert!(UsageSource::parse("guessed").is_err());
        assert!(UsageSource::parse("fake").is_err());
    }

    #[tokio::test]
    async fn test_record_and_get_latest_usage() {
        let pool = setup_test_db().await;
        let profile_id = "test-prof-1".to_string();

        // 1. Record an initial estimated reading without reset_at
        let input1 = RecordUsageInput {
            profile_id: profile_id.clone(),
            source: "estimated".to_string(),
            window: Some("daily".to_string()),
            value_used: Some(1500.0),
            value_limit: Some(10000.0),
            unit: Some("tokens".to_string()),
            reset_at: None,
            detail: None,
        };
        let r1 = record_usage(&pool, input1).await.unwrap();
        assert_eq!(r1.source, "estimated");
        assert!(r1.reset_at.is_none());

        // 2. Record a later official reading with reset_at
        let input2 = RecordUsageInput {
            profile_id: profile_id.clone(),
            source: "official".to_string(),
            window: Some("daily".to_string()),
            value_used: Some(2500.0),
            value_limit: Some(10000.0),
            unit: Some("tokens".to_string()),
            reset_at: Some("2026-11-03T00:00:00Z".to_string()),
            detail: Some("Official response from CLI".to_string()),
        };
        let r2 = record_usage(&pool, input2).await.unwrap();
        assert_eq!(r2.source, "official");
        assert_eq!(r2.reset_at.as_deref(), Some("2026-11-03T00:00:00Z"));

        // 3. Fetch latest
        let latest = get_latest_usage(&pool, &profile_id).await.unwrap().unwrap();
        assert_eq!(latest.id, r2.id);
        assert_eq!(latest.source, "official");
        assert_eq!(latest.value_used, Some(2500.0));
    }

    #[tokio::test]
    async fn test_unknown_source_reading() {
        let pool = setup_test_db().await;
        let profile_id = "test-prof-unknown".to_string();

        let input = RecordUsageInput {
            profile_id: profile_id.clone(),
            source: "unknown".to_string(),
            window: None,
            value_used: None,
            value_limit: None,
            unit: None,
            reset_at: None,
            detail: Some("Adapter cannot verify exact balance".to_string()),
        };

        let reading = record_usage(&pool, input).await.unwrap();
        assert_eq!(reading.source, "unknown");
        assert!(reading.value_used.is_none());
        assert!(reading.value_limit.is_none());
        assert!(reading.reset_at.is_none());
    }
}
