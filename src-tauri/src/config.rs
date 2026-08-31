use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::sync::RwLock;

use crate::constants::CONFIG_FILE_NAME;
#[cfg(windows)]
use crate::constants::CONFIG_SECRETS_FILE_NAME;
use crate::durable_json::JsonFile;
#[cfg(windows)]
use crate::secret_store::{SecretStore, StoredSecrets};
use crate::types::{AppConfig, AuthTokens, WindowPosition};

#[derive(Debug)]
pub struct ConfigState {
    inner: RwLock<AppConfig>,
    path: PathBuf,
    #[cfg(windows)]
    secret_store: SecretStore,
}

impl ConfigState {
    fn next_revision(current: u64) -> Result<u64> {
        current
            .checked_add(1)
            .ok_or_else(|| anyhow!("Configuration storage revision is exhausted"))
    }

    fn next_auth_revision(current: u64) -> Result<u64> {
        current
            .checked_add(1)
            .ok_or_else(|| anyhow!("Authentication revision is exhausted"))
    }

    fn apply_auth_revision(next: &mut AppConfig, previous: &AppConfig) -> Result<()> {
        next.auth_revision = if next.auth != previous.auth {
            Self::next_auth_revision(previous.auth_revision)?
        } else {
            previous.auth_revision
        };
        Ok(())
    }

    fn bind_auth_to_backend(next: &mut AppConfig, previous: &AppConfig) {
        if next.backend_domain != previous.backend_domain {
            next.auth = AuthTokens::default();
        }
    }

    pub async fn initialize(app: &AppHandle) -> Result<Self> {
        let mut dir = app
            .path()
            .app_config_dir()
            .map_err(|error| anyhow!("Не удалось определить директорию конфигурации: {error}"))?;
        if !dir.exists() {
            fs::create_dir_all(&dir).await?;
        }
        #[cfg(windows)]
        let secret_store = SecretStore::new(dir.join(CONFIG_SECRETS_FILE_NAME));
        dir.push(CONFIG_FILE_NAME);
        let path = dir;
        let mut config = JsonFile::read::<AppConfig>(&path)
            .await?
            .unwrap_or_default();

        #[cfg(windows)]
        if let Some(secrets) = secret_store
            .read_for_revision(config.storage_revision)
            .await?
        {
            if secrets.storage_revision > config.storage_revision {
                config = secrets
                    .config_shadow()
                    .ok_or_else(|| anyhow!("Protected config shadow is invalid"))?
                    .clone();
            } else {
                config.auth_revision = secrets.auth_revision;
                config.auth = secrets.auth;
                config.api_keys = secrets.api_keys;
            }
        }
        #[cfg(not(windows))]
        {
            config.auth = AuthTokens::default();
            config.api_keys = Default::default();
        }
        config.normalize();

        let state = Self {
            inner: RwLock::new(config),
            path,
            #[cfg(windows)]
            secret_store,
        };
        let config = state.get().await;
        state.persist(&config, None).await?;
        // The second rotation replaces a legacy plaintext backup with a sanitized copy.
        state.persist(&config, Some(&config)).await?;
        Ok(state)
    }

    pub async fn get(&self) -> AppConfig {
        self.inner.read().await.clone()
    }

    pub async fn path(&self) -> PathBuf {
        self.path.clone()
    }

    #[allow(dead_code)]
    pub async fn set(&self, next: AppConfig) -> Result<AppConfig> {
        let mut guard = self.inner.write().await;
        let previous = guard.clone();
        let mut normalized = next;
        normalized.normalize();
        Self::bind_auth_to_backend(&mut normalized, &previous);
        Self::apply_auth_revision(&mut normalized, &previous)?;
        normalized.storage_revision = Self::next_revision(previous.storage_revision)?;
        self.persist(&normalized, Some(&previous)).await?;
        *guard = normalized.clone();
        Ok(normalized)
    }

    pub async fn update(&self, mut partial: Value) -> Result<AppConfig> {
        let mut guard = self.inner.write().await;
        if let Value::Object(partial_map) = &mut partial {
            partial_map.remove("auth");
            partial_map.remove("authRevision");
            partial_map.remove("storageRevision");
        }
        let mut current = serde_json::to_value(&*guard)?;
        merge_values(&mut current, partial);
        let mut next: AppConfig = serde_json::from_value(current)?;
        next.normalize();
        Self::bind_auth_to_backend(&mut next, &guard);
        Self::apply_auth_revision(&mut next, &guard)?;
        next.storage_revision = Self::next_revision(guard.storage_revision)?;
        self.persist(&next, Some(&guard)).await?;
        *guard = next.clone();
        Ok(next)
    }

    pub async fn reset(&self) -> Result<AppConfig> {
        let mut guard = self.inner.write().await;
        let previous = guard.clone();
        let mut config = AppConfig::default();
        config.normalize();
        Self::apply_auth_revision(&mut config, &previous)?;
        config.storage_revision = Self::next_revision(previous.storage_revision)?;
        self.persist(&config, Some(&previous)).await?;
        *guard = config.clone();
        Ok(config)
    }

    pub async fn set_auth_tokens(
        &self,
        tokens: AuthTokens,
        expected_auth_revision: Option<u64>,
        expected_backend_domain: Option<&str>,
    ) -> Result<AppConfig> {
        let mut guard = self.inner.write().await;
        if expected_auth_revision.is_some_and(|revision| revision != guard.auth_revision) {
            return Err(anyhow!("Authentication session changed while refreshing"));
        }
        if expected_backend_domain.is_some_and(|domain| domain != guard.backend_domain.as_str()) {
            return Err(anyhow!("Authentication backend changed while refreshing"));
        }
        let mut next = guard.clone();
        next.auth = tokens;
        next.normalize();
        Self::apply_auth_revision(&mut next, &guard)?;
        next.storage_revision = Self::next_revision(guard.storage_revision)?;
        self.persist(&next, Some(&guard)).await?;
        *guard = next.clone();
        Ok(next)
    }

    #[allow(dead_code)]
    pub async fn mic_window_position(&self) -> Option<WindowPosition> {
        self.inner.read().await.mic_window_position.clone()
    }

    #[allow(dead_code)]
    pub async fn set_mic_window_position(&self, position: Option<WindowPosition>) -> Result<()> {
        let mut guard = self.inner.write().await;
        let mut next = guard.clone();
        next.mic_window_position = position;
        next.storage_revision = Self::next_revision(guard.storage_revision)?;
        self.persist(&next, Some(&guard)).await?;
        *guard = next;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn mic_anchor(&self) -> String {
        self.inner.read().await.mic_anchor.clone()
    }

    #[allow(dead_code)]
    pub async fn set_mic_anchor(&self, anchor: String) -> Result<()> {
        let mut guard = self.inner.write().await;
        let mut next = guard.clone();
        next.mic_anchor = anchor;
        next.storage_revision = Self::next_revision(guard.storage_revision)?;
        self.persist(&next, Some(&guard)).await?;
        *guard = next;
        Ok(())
    }

    async fn persist(
        &self,
        state: &AppConfig,
        #[cfg_attr(not(windows), allow(unused_variables))] previous: Option<&AppConfig>,
    ) -> Result<()> {
        #[cfg(windows)]
        {
            let secret_write_needed =
                previous.is_none_or(|previous| previous.storage_revision != state.storage_revision);
            if secret_write_needed {
                self.secret_store
                    .write(&Self::secrets(state))
                    .await
                    .context("write protected secrets")?;
            }
            let mut public_state = state.clone();
            public_state.auth = AuthTokens::default();
            public_state.api_keys = Default::default();
            if let Err(config_error) = JsonFile::write(&self.path, &public_state).await {
                if secret_write_needed && previous.is_some() {
                    if let Err(rollback_error) = self.secret_store.rollback().await {
                        return Err(anyhow!(
                            "Failed to write config: {config_error:#}. Failed to restore protected secrets: {rollback_error:#}"
                        ));
                    }
                }
                return Err(config_error).context("write config");
            }
            Ok(())
        }

        #[cfg(not(windows))]
        {
            let mut public_state = state.clone();
            public_state.auth = AuthTokens::default();
            public_state.api_keys = Default::default();
            JsonFile::write(&self.path, &public_state)
                .await
                .context("write config")
        }
    }

    #[cfg(windows)]
    fn secrets(state: &AppConfig) -> StoredSecrets {
        StoredSecrets {
            storage_revision: state.storage_revision,
            auth_revision: state.auth_revision,
            auth: state.auth.clone(),
            api_keys: state.api_keys.clone(),
            config: Some(state.clone()),
            ..StoredSecrets::default()
        }
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
    config.auto_start_local_speech_server && config.setup_completed && config.speech.mode == "local"
}

#[cfg(test)]
mod tests {
    use crate::types::{AppConfig, AuthTokens};

    use super::ConfigState;

    #[test]
    fn storage_revision_never_saturates() {
        assert_eq!(ConfigState::next_revision(41).unwrap(), 42);
        assert!(ConfigState::next_revision(u64::MAX).is_err());
    }

    #[test]
    fn auth_revision_changes_only_with_auth() {
        let previous = AppConfig {
            auth_revision: 7,
            ..AppConfig::default()
        };

        let mut settings_update = previous.clone();
        settings_update.mic_hotkey = "Alt+W".to_string();
        ConfigState::apply_auth_revision(&mut settings_update, &previous).unwrap();
        assert_eq!(settings_update.auth_revision, 7);

        let mut auth_update = previous.clone();
        auth_update.auth.access = "new-access-token".to_string();
        ConfigState::apply_auth_revision(&mut auth_update, &previous).unwrap();
        assert_eq!(auth_update.auth_revision, 8);
    }

    #[test]
    fn backend_change_clears_auth_and_changes_auth_revision() {
        let previous = AppConfig {
            auth_revision: 3,
            auth: AuthTokens {
                access: "old-domain-token".to_string(),
                access_token: "old-domain-token".to_string(),
                ..AuthTokens::default()
            },
            ..AppConfig::default()
        };

        let mut next = previous.clone();
        next.backend_domain = "https://another-backend.example".to_string();
        ConfigState::bind_auth_to_backend(&mut next, &previous);
        ConfigState::apply_auth_revision(&mut next, &previous).unwrap();

        assert_eq!(next.auth, AuthTokens::default());
        assert_eq!(next.auth_revision, 4);
    }
}
