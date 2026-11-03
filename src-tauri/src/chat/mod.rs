use std::collections::HashMap;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tracing::info;
use uuid::Uuid;

use crate::process::OwnedJobObject;
use crate::profiles::{self, Profile};
use crate::projects::get_project;