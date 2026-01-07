use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::fs;
use uuid::Uuid;

const HISTORY_DIR_NAME: &str = "history";
const HISTORY_FILE_NAME: &str = "actions.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ActionHistoryEntry {
    pub id: String,
    pub created_at: String,
    pub action_id: String,
    pub action_name: String,
    pub action_prompt: Option<String>,
    pub transcription: String,
    pub llm_response: Option<String>,
    pub result_text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ActionHistoryInput {
    pub action_id: String,
    pub action_name: String,
    pub action_prompt: Option<String>,
    pub transcription: String,
    pub llm_response: Option<String>,
    pub result_text: String,
}

fn resolve_history_dir(app: &AppHandle) -> Result<PathBuf> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .or_else(|_| app.path().app_config_dir())
        .or_else(|_| std::env::current_dir())
        .map_err(|error| anyhow!("Failed to resolve history directory: {error}"))?;
    Ok(base_dir.join(HISTORY_DIR_NAME))
}

async fn history_file_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = resolve_history_dir(app)?;
    fs::create_dir_all(&dir)
        .await
        .with_context(|| format!("create history directory at {}", dir.display()))?;
    Ok(dir.join(HISTORY_FILE_NAME))
}

pub async fn read_history(app: &AppHandle) -> Result<Vec<ActionHistoryEntry>> {
    let path = history_file_path(app).await?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&path)
        .await
        .with_context(|| format!("read history from {}", path.display()))?;
    if contents.trim().is_empty() {
        return Ok(Vec::new());
    }
    match serde_json::from_str::<Vec<ActionHistoryEntry>>(&contents) {
        Ok(entries) => Ok(entries),
        Err(error) => {
            eprintln!("[history] Failed to parse history file: {error}");
            Ok(Vec::new())
        }
    }
}

async fn write_history(app: &AppHandle, entries: &[ActionHistoryEntry]) -> Result<()> {
    let path = history_file_path(app).await?;
    let serialized = serde_json::to_string_pretty(entries).context("serialize history")?;
    fs::write(&path, serialized)
        .await
        .with_context(|| format!("write history to {}", path.display()))
}

pub async fn append_history(app: &AppHandle, payload: ActionHistoryInput) -> Result<ActionHistoryEntry> {
    let mut entries = match read_history(app).await {
        Ok(existing) => existing,
        Err(error) => {
            eprintln!("[history] Failed to read history before append: {error}");
            Vec::new()
        }
    };

    let entry = ActionHistoryEntry {
        id: Uuid::new_v4().to_string(),
        created_at: Utc::now().to_rfc3339(),
        action_id: payload.action_id,
        action_name: payload.action_name,
        action_prompt: payload.action_prompt,
        transcription: payload.transcription,
        llm_response: payload.llm_response,
        result_text: payload.result_text,
    };

    entries.insert(0, entry.clone());
    write_history(app, &entries).await?;
    Ok(entry)
}

pub async fn clear_history(app: &AppHandle) -> Result<()> {
    let path = history_file_path(app).await?;
    fs::write(&path, "[]")
        .await
        .with_context(|| format!("clear history at {}", path.display()))
}
