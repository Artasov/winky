use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::durable_json::JsonFile;

const NOTES_DIR_NAME: &str = "notes";
const NOTES_FILE_NAME: &str = "notes.json";
const LOCAL_PROFILE_ID: &str = "local";

static NOTES_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct NoteEntry {
    pub id: String,
    pub profile: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub x_username: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NoteListResponse {
    pub count: usize,
    pub next_page: Option<u32>,
    pub previous_page: Option<u32>,
    pub results: Vec<NoteEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NoteCreateInput {
    pub title: String,
    pub description: Option<String>,
    pub x_username: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NoteUpdateInput {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub x_username: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NoteDeleteInput {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NoteBulkDeleteInput {
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NoteBulkDeleteResponse {
    pub deleted_count: usize,
}

fn resolve_notes_dir(app: &AppHandle) -> Result<PathBuf> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .or_else(|_| app.path().app_config_dir())
        .or_else(|_| std::env::current_dir())
        .map_err(|error| anyhow!("Failed to resolve notes directory: {error}"))?;
    Ok(base_dir.join(NOTES_DIR_NAME))
}

async fn notes_file_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = resolve_notes_dir(app)?;
    fs::create_dir_all(&dir)
        .await
        .with_context(|| format!("create notes directory at {}", dir.display()))?;
    Ok(dir.join(NOTES_FILE_NAME))
}

async fn read_notes(app: &AppHandle) -> Result<Vec<NoteEntry>> {
    let path = notes_file_path(app).await?;
    Ok(JsonFile::read::<Vec<NoteEntry>>(&path)
        .await?
        .unwrap_or_default())
}

async fn write_notes(app: &AppHandle, entries: &[NoteEntry]) -> Result<()> {
    let path = notes_file_path(app).await?;
    JsonFile::write(&path, &entries)
        .await
        .with_context(|| format!("write notes to {}", path.display()))
}

pub async fn list_notes(app: &AppHandle, page: u32, page_size: u32) -> Result<NoteListResponse> {
    let _guard = NOTES_LOCK.lock().await;
    let page = page.max(1);
    let page_size = page_size.max(1);
    let entries = read_notes(app).await?;
    let total = entries.len();
    let start = (page as usize - 1) * page_size as usize;
    let end = usize::min(start + page_size as usize, total);
    let results = if start < total {
        entries[start..end].to_vec()
    } else {
        Vec::new()
    };
    let next_page = if end < total { Some(page + 1) } else { None };
    let previous_page = if page > 1 && start > 0 {
        Some(page - 1)
    } else {
        None
    };

    Ok(NoteListResponse {
        count: total,
        next_page,
        previous_page,
        results,
    })
}

pub async fn create_note(app: &AppHandle, payload: NoteCreateInput) -> Result<NoteEntry> {
    let _guard = NOTES_LOCK.lock().await;
    let mut entries = read_notes(app).await?;

    let trimmed_title = payload.title.trim();
    if trimmed_title.is_empty() {
        return Err(anyhow!("Title cannot be empty"));
    }
    let description = payload.description.unwrap_or_default();
    let x_username = payload.x_username.unwrap_or_default().trim().to_string();
    let now = Utc::now().to_rfc3339();

    let entry = NoteEntry {
        id: Uuid::new_v4().to_string(),
        profile: LOCAL_PROFILE_ID.to_string(),
        title: trimmed_title.to_string(),
        description,
        x_username,
        created_at: now.clone(),
        updated_at: now,
    };

    entries.insert(0, entry.clone());
    write_notes(app, &entries).await?;
    Ok(entry)
}

pub async fn update_note(app: &AppHandle, payload: NoteUpdateInput) -> Result<NoteEntry> {
    let _guard = NOTES_LOCK.lock().await;
    let mut entries = read_notes(app).await?;
    let mut updated_entry: Option<NoteEntry> = None;

    for entry in &mut entries {
        if entry.id == payload.id {
            if let Some(title) = payload.title.as_ref() {
                let trimmed = title.trim();
                if trimmed.is_empty() {
                    return Err(anyhow!("Title cannot be empty"));
                }
                entry.title = trimmed.to_string();
            }
            if let Some(description) = payload.description.as_ref() {
                entry.description = description.clone();
            }
            if let Some(x_username) = payload.x_username.as_ref() {
                entry.x_username = x_username.trim().to_string();
            }
            entry.updated_at = Utc::now().to_rfc3339();
            updated_entry = Some(entry.clone());
            break;
        }
    }

    let updated = updated_entry.ok_or_else(|| anyhow!("Note not found"))?;
    write_notes(app, &entries).await?;
    Ok(updated)
}

pub async fn delete_note(app: &AppHandle, payload: NoteDeleteInput) -> Result<()> {
    let _guard = NOTES_LOCK.lock().await;
    let mut entries = read_notes(app).await?;
    let before = entries.len();
    entries.retain(|entry| entry.id != payload.id);
    if entries.len() == before {
        return Err(anyhow!("Note not found"));
    }
    write_notes(app, &entries).await?;
    Ok(())
}

pub async fn bulk_delete_notes(
    app: &AppHandle,
    payload: NoteBulkDeleteInput,
) -> Result<NoteBulkDeleteResponse> {
    let _guard = NOTES_LOCK.lock().await;
    if payload.ids.is_empty() {
        return Err(anyhow!("Ids cannot be empty"));
    }
    let mut entries = read_notes(app).await?;
    let before = entries.len();
    entries.retain(|entry| !payload.ids.contains(&entry.id));
    let deleted_count = before.saturating_sub(entries.len());
    write_notes(app, &entries).await?;
    Ok(NoteBulkDeleteResponse { deleted_count })
}
