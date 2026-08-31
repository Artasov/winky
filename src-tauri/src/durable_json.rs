use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{de::DeserializeOwned, Serialize};
use tokio::fs;
use uuid::Uuid;

pub struct JsonFile;

impl JsonFile {
    pub async fn read<T>(path: &Path) -> Result<Option<T>>
    where
        T: DeserializeOwned + Serialize,
    {
        match Self::read_path(path).await {
            Ok(Some(value)) => Ok(Some(value)),
            Ok(None) => Self::restore_backup(path).await,
            Err(primary_error) => {
                let quarantine_path = Self::quarantine(path).await?;
                match Self::restore_backup(path).await {
                    Ok(Some(value)) => {
                        eprintln!(
                            "[storage] Recovered {} from backup; damaged file moved to {}",
                            path.display(),
                            quarantine_path.display()
                        );
                        Ok(Some(value))
                    }
                    Ok(None) => Err(primary_error),
                    Err(backup_error) => Err(anyhow!(
                        "Failed to read {} and its backup. Primary: {primary_error:#}. Backup: {backup_error:#}",
                        path.display()
                    )),
                }
            }
        }
    }

    pub async fn write<T>(path: &Path, value: &T) -> Result<()>
    where
        T: Serialize,
    {
        let bytes = serde_json::to_vec_pretty(value).context("serialize JSON storage")?;
        Self::write_bytes(path, &bytes, true).await
    }

    async fn read_path<T>(path: &Path) -> Result<Option<T>>
    where
        T: DeserializeOwned,
    {
        let contents = match fs::read(path).await {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(error).with_context(|| format!("read JSON storage {}", path.display()))
            }
        };

        if contents.is_empty() {
            return Err(anyhow!("JSON storage {} is empty", path.display()));
        }

        serde_json::from_slice(&contents)
            .with_context(|| format!("parse JSON storage {}", path.display()))
            .map(Some)
    }

    async fn restore_backup<T>(path: &Path) -> Result<Option<T>>
    where
        T: DeserializeOwned + Serialize,
    {
        let backup_path = Self::backup_path(path)?;
        let value = match Self::read_path::<T>(&backup_path).await {
            Ok(value) => value,
            Err(error) => {
                let quarantine_path = Self::quarantine(&backup_path).await?;
                return Err(anyhow!(
                    "Backup {} is damaged and was moved to {}: {error:#}",
                    backup_path.display(),
                    quarantine_path.display()
                ));
            }
        };

        let Some(value) = value else { return Ok(None) };
        let bytes =
            serde_json::to_vec_pretty(&value).context("serialize recovered JSON storage")?;
        Self::write_bytes(path, &bytes, false).await?;
        Ok(Some(value))
    }

    async fn write_bytes(path: &Path, bytes: &[u8], rotate_backup: bool) -> Result<()> {
        let parent = path
            .parent()
            .ok_or_else(|| anyhow!("JSON storage path has no parent: {}", path.display()))?;
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("create JSON storage directory {}", parent.display()))?;

        let temp_path = Self::temp_path(path)?;
        fs::write(&temp_path, bytes)
            .await
            .with_context(|| format!("write temporary JSON storage {}", temp_path.display()))?;
        let temp_file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&temp_path)
            .await
            .with_context(|| format!("open temporary JSON storage {}", temp_path.display()))?;
        temp_file
            .sync_all()
            .await
            .with_context(|| format!("sync temporary JSON storage {}", temp_path.display()))?;

        let backup_path = Self::backup_path(path)?;
        if rotate_backup && fs::metadata(path).await.is_ok() {
            if fs::metadata(&backup_path).await.is_ok() {
                fs::remove_file(&backup_path)
                    .await
                    .with_context(|| format!("remove old JSON backup {}", backup_path.display()))?;
            }
            if let Err(error) = fs::rename(path, &backup_path).await {
                let _ = fs::remove_file(&temp_path).await;
                return Err(error)
                    .with_context(|| format!("rotate JSON backup for {}", path.display()));
            }
        }

        if let Err(error) = fs::rename(&temp_path, path).await {
            if fs::metadata(path).await.is_err() && fs::metadata(&backup_path).await.is_ok() {
                if let Err(restore_error) = fs::rename(&backup_path, path).await {
                    return Err(anyhow!(
                        "Failed to publish {}: {error}. Failed to restore backup: {restore_error}",
                        path.display()
                    ));
                }
            }
            return Err(error).with_context(|| format!("publish JSON storage {}", path.display()));
        }

        Ok(())
    }

    async fn quarantine(path: &Path) -> Result<PathBuf> {
        if fs::metadata(path).await.is_err() {
            return Ok(path.to_path_buf());
        }
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid JSON storage file name: {}", path.display()))?;
        let quarantine_path = path.with_file_name(format!(
            "{file_name}.corrupt-{}",
            Utc::now().timestamp_millis()
        ));
        fs::rename(path, &quarantine_path)
            .await
            .with_context(|| format!("quarantine damaged JSON storage {}", path.display()))?;
        Ok(quarantine_path)
    }

    fn backup_path(path: &Path) -> Result<PathBuf> {
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid JSON storage file name: {}", path.display()))?;
        Ok(path.with_file_name(format!("{file_name}.backup")))
    }

    fn temp_path(path: &Path) -> Result<PathBuf> {
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid JSON storage file name: {}", path.display()))?;
        Ok(path.with_file_name(format!("{file_name}.{}.tmp", Uuid::new_v4())))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};
    use tokio::fs;
    use uuid::Uuid;

    use super::JsonFile;

    #[tokio::test]
    async fn recovers_previous_value_after_primary_is_truncated() {
        let dir = std::env::temp_dir().join(format!("winky-json-test-{}", Uuid::new_v4()));
        let path = dir.join("state.json");
        fs::create_dir_all(&dir).await.unwrap();

        JsonFile::write(&path, &json!({"revision": 1}))
            .await
            .unwrap();
        JsonFile::write(&path, &json!({"revision": 2}))
            .await
            .unwrap();
        fs::write(&path, b"{").await.unwrap();

        let recovered = JsonFile::read::<Value>(&path).await.unwrap().unwrap();
        assert_eq!(recovered, json!({"revision": 1}));
        assert!(serde_json::from_slice::<Value>(&fs::read(&path).await.unwrap()).is_ok());

        fs::remove_dir_all(&dir).await.unwrap();
    }

    #[tokio::test]
    async fn restores_backup_when_primary_is_missing() {
        let dir = std::env::temp_dir().join(format!("winky-json-test-{}", Uuid::new_v4()));
        let path = dir.join("state.json");
        fs::create_dir_all(&dir).await.unwrap();

        JsonFile::write(&path, &json!({"revision": 1}))
            .await
            .unwrap();
        JsonFile::write(&path, &json!({"revision": 2}))
            .await
            .unwrap();
        fs::remove_file(&path).await.unwrap();

        let recovered = JsonFile::read::<Value>(&path).await.unwrap().unwrap();
        assert_eq!(recovered, json!({"revision": 1}));
        assert!(fs::metadata(&path).await.is_ok());

        fs::remove_dir_all(&dir).await.unwrap();
    }
}
