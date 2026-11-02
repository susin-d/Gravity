use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use tracing::info;

/// Wrapper around the SQLite connection pool.
#[derive(Clone)]
pub struct Db(pub SqlitePool);

impl Db {
    /// Open (or create) the Gravity database at `<app_data>/gravity.db`.
    /// Runs embedded migrations on first open.
    pub async fn open(app_data: &Path) -> anyhow::Result<Self> {
        let db_path = app_data.join("gravity.db");
        info!("Opening database at {}", db_path.display());

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        // Run migrations embedded at compile time
        sqlx::migrate!("./migrations").run(&pool).await?;

        info!("Database ready (WAL mode, FK on)");
        Ok(Self(pool))
    }

    /// Get a reference to the underlying pool.
    pub fn pool(&self) -> &SqlitePool {
        &self.0
    }
}
