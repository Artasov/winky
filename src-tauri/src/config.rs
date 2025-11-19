use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::sync::RwLock;

use crate::constants::CONFIG_FILE_NAME;
use crate::types::{AppConfig, AuthTokens, WindowPosition};

#[derive(Debug)]
pub struct ConfigState {
    inner: RwLock<AppConfig>,
    path: PathBuf,
}

impl ConfigState {
    pub async fn initialize(app: &AppHandle) -> Result<Self> {
        let mut dir = app
            .path()
            .app_config_dir()
            .map_err(|error| anyhow!("Не удалось определить директорию конфигурации: {error}"))?;
        if !dir.exists() {
            fs::create_dir_all(&dir).await?;
        }
        dir.push(CONFIG_FILE_NAME);
        let path = dir;
        let config = if Path::new(&path).exists() {
            let contents = fs::read_to_string(&path).await?;
            let mut config: AppConfig = serde_json::from_str(&contents).unwrap_or_default();
            config.normalize();
            config
        } else {
            let mut config = AppConfig::default();
            config.normalize();
            let serialized = serde_json::to_string_pretty(&config)?;
            fs::write(&path, serialized).await?;
            config
        };

        Ok(Self {
            inner: RwLock::new(config),
            path,
        })
    }

    pub async fn get(&self) -> AppConfig {
        self.inner.read().await.clone()
    }

    pub async fn path(&self) -> PathBuf {
        self.path.clone()
    }

    #[allow(dead_code)]
    pub async fn set(&self, next: AppConfig) -> Result<AppConfig> {
        let mut normalized = next;
        normalized.normalize();
        self.persist(&normalized).await?;
        *self.inner.write().await = normalized.clone();
        Ok(normalized)
    }

    pub async fn update(&self, partial: Value) -> Result<AppConfig> {
        let mut guard = self.inner.write().await;
        let mut current = serde_json::to_value(&*guard)?;
        merge_values(&mut current, partial);
        let mut next: AppConfig = serde_json::from_value(current)?;
        next.normalize();
        self.persist(&next).await?;
        *guard = next.clone();
        Ok(next)
    }

    pub async fn reset(&self) -> Result<AppConfig> {
        let mut config = AppConfig::default();
        config.normalize();
        self.persist(&config).await?;
        *self.inner.write().await = config.clone();
        Ok(config)
    }

    pub async fn set_auth_tokens(&self, tokens: AuthTokens) -> Result<AppConfig> {
        let mut guard = self.inner.write().await;
        guard.auth = tokens;
        guard.normalize();
        self.persist(&guard).await?;
        Ok(guard.clone())
    }

    #[allow(dead_code)]
    pub async fn mic_window_position(&self) -> Option<WindowPosition> {
        self.inner.read().await.mic_window_position.clone()
    }

    #[allow(dead_code)]
    pub async fn set_mic_window_position(&self, position: Option<WindowPosition>) -> Result<()> {
        let mut guard = self.inner.write().await;
        guard.mic_window_position = position;
        self.persist(&guard).await
    }

    #[allow(dead_code)]
    pub async fn mic_anchor(&self) -> String {
        self.inner.read().await.mic_anchor.clone()
    }

    #[allow(dead_code)]
    pub async fn set_mic_anchor(&self, anchor: String) -> Result<()> {
        let mut guard = self.inner.write().await;
        guard.mic_anchor = anchor;
        self.persist(&guard).await
    }

    async fn persist(&self, state: &AppConfig) -> Result<()> {
        let serialized = serde_json::to_string_pretty(state).context("serialize config")?;
        fs::write(&self.path, serialized).await.context("write config")
    }
}

fn merge_values(target: &mut Value, patch: Value) {
    match patch {
        Value::Object(patch_map) => {
            if !target.is_object() {
                *target = Value::Object(Map::new());
            }
            if let Value::Object(target_map) = target {
                for (key, value) in patch_map {
                    merge_values(target_map.entry(key).or_insert(Value::Null), value);
                }
            }
        }
        other => {
            *target = other;
        }
    }
}

pub fn should_auto_start_local_speech(config: &AppConfig) -> bool {
    config.auto_start_local_speech_server
        && config.setup_completed
        && config.speech.mode == "local"
}
