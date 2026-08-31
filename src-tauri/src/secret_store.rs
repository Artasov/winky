use std::path::{Path, PathBuf};
use std::ptr;
use std::slice;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::fs;
use uuid::Uuid;
use winapi::shared::minwindef::{BYTE, DWORD, HLOCAL};
use winapi::um::dpapi::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN};
use winapi::um::winbase::LocalFree;
use winapi::um::wincrypt::DATA_BLOB;

use crate::types::{ApiKeys, AppConfig, AuthTokens};

const SECRET_STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSecrets {
    #[serde(default = "StoredSecrets::version")]
    pub version: u32,
    #[serde(default)]
    pub storage_revision: u64,
    #[serde(default)]
    pub auth_revision: u64,
    #[serde(default)]
    pub auth: AuthTokens,
    #[serde(default)]
    pub api_keys: ApiKeys,
    #[serde(default)]
    pub config: Option<AppConfig>,
}

impl Default for StoredSecrets {
    fn default() -> Self {
        Self {
            version: Self::version(),
            storage_revision: 0,
            auth_revision: 0,
            auth: AuthTokens::default(),
            api_keys: ApiKeys::default(),
            config: None,
        }
    }
}

impl StoredSecrets {
    fn version() -> u32 {
        SECRET_STORE_VERSION
    }

    pub fn config_shadow(&self) -> Option<&AppConfig> {
        self.config.as_ref().filter(|config| {
            config.storage_revision == self.storage_revision
                && config.auth_revision == self.auth_revision
                && config.auth == self.auth
                && config.api_keys == self.api_keys
        })
    }
}

#[derive(Debug)]
pub struct SecretStore {
    path: PathBuf,
}

impl SecretStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub async fn read(&self) -> Result<Option<StoredSecrets>> {
        match self.read_path(&self.path).await {
            Ok(Some(secrets)) => Ok(Some(secrets)),
            Ok(None) => self.restore_backup().await,
            Err(primary_error) => {
                let quarantine_path = self.quarantine(&self.path).await?;
                match self.restore_backup().await {
                    Ok(Some(secrets)) => {
                        eprintln!(
                            "[storage] Recovered protected secrets from backup; damaged file moved to {}",
                            quarantine_path.display()
                        );
                        Ok(Some(secrets))
                    }
                    Ok(None) => {
                        eprintln!(
                            "[storage] Protected secrets could not be recovered; damaged file moved to {}. Sign-in is required: {primary_error:#}",
                            quarantine_path.display()
                        );
                        Ok(None)
                    }
                    Err(backup_error) => Err(anyhow!(
                        "Failed to read protected secrets and backup. Primary: {primary_error:#}. Backup: {backup_error:#}"
                    )),
                }
            }
        }
    }

    pub async fn read_for_revision(&self, expected_revision: u64) -> Result<Option<StoredSecrets>> {
        let Some(current) = self.read().await? else {
            return Ok(None);
        };
        if current.storage_revision == expected_revision {
            return Ok(Some(current));
        }
        if current.storage_revision > expected_revision && current.config_shadow().is_some() {
            eprintln!(
                "[storage] Protected config revision {} is newer than public revision {}. Recovering the committed state from its protected shadow",
                current.storage_revision,
                expected_revision
            );
            return Ok(Some(current));
        }

        let backup_path = self.backup_path()?;
        let backup = match self.read_path(&backup_path).await {
            Ok(backup) => backup,
            Err(error) => {
                let quarantine_path = self.quarantine(&backup_path).await?;
                eprintln!(
                    "[storage] Damaged protected secrets backup moved to {} while recovering revision {}: {error:#}",
                    quarantine_path.display(),
                    expected_revision
                );
                None
            }
        };
        if let Some(backup) = backup {
            if backup.storage_revision == expected_revision {
                self.rollback().await?;
                eprintln!(
                    "[storage] Rolled protected secrets back from revision {} to committed revision {}",
                    current.storage_revision,
                    expected_revision
                );
                return Ok(Some(backup));
            }
        }

        eprintln!(
            "[storage] Protected secrets revision {} does not match committed config revision {}. Sign-in is required",
            current.storage_revision,
            expected_revision
        );
        Ok(None)
    }

    pub async fn write(&self, secrets: &StoredSecrets) -> Result<()> {
        let serialized = serde_json::to_vec(secrets).context("serialize protected secrets")?;
        let protected = Self::protect(&serialized)?;
        self.write_bytes(&protected, true).await
    }

    pub async fn rollback(&self) -> Result<()> {
        let backup_path = self.backup_path()?;
        if fs::metadata(&backup_path).await.is_err() {
            return Err(anyhow!("Protected secrets backup is missing"));
        }

        let displaced_path = self.temp_path()?;
        let had_primary = fs::metadata(&self.path).await.is_ok();
        if had_primary {
            fs::rename(&self.path, &displaced_path)
                .await
                .context("stage uncommitted protected secrets")?;
        }
        if let Err(error) = fs::rename(&backup_path, &self.path).await {
            if had_primary {
                if let Err(restore_error) = fs::rename(&displaced_path, &self.path).await {
                    return Err(anyhow!(
                        "Failed to restore protected secrets backup: {error}. Failed to restore uncommitted primary: {restore_error}"
                    ));
                }
            }
            return Err(error).context("restore protected secrets backup");
        }
        if had_primary {
            if let Err(error) = fs::remove_file(&displaced_path).await {
                eprintln!(
                    "[storage] Failed to remove rolled-back protected secrets {}: {error}",
                    displaced_path.display()
                );
            }
        }
        Ok(())
    }

    async fn read_path(&self, path: &Path) -> Result<Option<StoredSecrets>> {
        let protected = match fs::read(path).await {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(error)
                    .with_context(|| format!("read protected secrets {}", path.display()))
            }
        };
        if protected.is_empty() {
            return Err(anyhow!(
                "Protected secrets file is empty: {}",
                path.display()
            ));
        }
        let serialized = Self::unprotect(&protected)?;
        let secrets: StoredSecrets = serde_json::from_slice(&serialized)
            .with_context(|| format!("parse protected secrets {}", path.display()))?;
        if secrets.version != SECRET_STORE_VERSION {
            return Err(anyhow!(
                "Unsupported protected secrets version: {}",
                secrets.version
            ));
        }
        Ok(Some(secrets))
    }

    async fn restore_backup(&self) -> Result<Option<StoredSecrets>> {
        let backup_path = self.backup_path()?;
        let secrets = match self.read_path(&backup_path).await {
            Ok(secrets) => secrets,
            Err(error) => {
                let quarantine_path = self.quarantine(&backup_path).await?;
                eprintln!(
                    "[storage] Damaged protected secrets backup moved to {}. Sign-in is required: {error:#}",
                    quarantine_path.display()
                );
                return Ok(None);
            }
        };
        let Some(secrets) = secrets else {
            return Ok(None);
        };
        let serialized = serde_json::to_vec(&secrets).context("serialize recovered secrets")?;
        let protected = Self::protect(&serialized)?;
        self.write_bytes(&protected, false).await?;
        Ok(Some(secrets))
    }

    async fn write_bytes(&self, protected: &[u8], rotate_backup: bool) -> Result<()> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| anyhow!("Protected secrets path has no parent"))?;
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("create secrets directory {}", parent.display()))?;

        let temp_path = self.temp_path()?;
        fs::write(&temp_path, protected)
            .await
            .with_context(|| format!("write temporary secrets {}", temp_path.display()))?;
        let temp_file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&temp_path)
            .await
            .with_context(|| format!("open temporary secrets {}", temp_path.display()))?;
        temp_file
            .sync_all()
            .await
            .with_context(|| format!("sync temporary secrets {}", temp_path.display()))?;

        let backup_path = self.backup_path()?;
        if rotate_backup && fs::metadata(&self.path).await.is_ok() {
            if fs::metadata(&backup_path).await.is_ok() {
                fs::remove_file(&backup_path).await.with_context(|| {
                    format!("remove old secrets backup {}", backup_path.display())
                })?;
            }
            if let Err(error) = fs::rename(&self.path, &backup_path).await {
                let _ = fs::remove_file(&temp_path).await;
                return Err(error).context("rotate protected secrets backup");
            }
        }

        if let Err(error) = fs::rename(&temp_path, &self.path).await {
            if fs::metadata(&self.path).await.is_err() && fs::metadata(&backup_path).await.is_ok() {
                if let Err(restore_error) = fs::rename(&backup_path, &self.path).await {
                    return Err(anyhow!(
                        "Failed to publish protected secrets: {error}. Failed to restore backup: {restore_error}"
                    ));
                }
            }
            return Err(error).context("publish protected secrets");
        }
        Ok(())
    }

    fn protect(data: &[u8]) -> Result<Vec<u8>> {
        Self::with_data_blob(data, |input, output| unsafe {
            CryptProtectData(
                input,
                ptr::null(),
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                output,
            )
        })
        .context("protect secrets with Windows DPAPI")
    }

    fn unprotect(data: &[u8]) -> Result<Vec<u8>> {
        Self::with_data_blob(data, |input, output| unsafe {
            CryptUnprotectData(
                input,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                output,
            )
        })
        .context("unprotect secrets with Windows DPAPI")
    }

    fn with_data_blob(
        data: &[u8],
        operation: impl FnOnce(*mut DATA_BLOB, *mut DATA_BLOB) -> i32,
    ) -> Result<Vec<u8>> {
        let data_length = DWORD::try_from(data.len()).context("secret data is too large")?;
        let mut input = DATA_BLOB {
            cbData: data_length,
            pbData: data.as_ptr() as *mut BYTE,
        };
        let mut output = DATA_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        if operation(&mut input, &mut output) == 0 {
            return Err(std::io::Error::last_os_error()).context("Windows DPAPI operation");
        }
        let result =
            unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
        unsafe {
            LocalFree(output.pbData as HLOCAL);
        }
        Ok(result)
    }

    fn backup_path(&self) -> Result<PathBuf> {
        let file_name = self
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid protected secrets file name"))?;
        Ok(self.path.with_file_name(format!("{file_name}.backup")))
    }

    async fn quarantine(&self, path: &Path) -> Result<PathBuf> {
        if fs::metadata(path).await.is_err() {
            return Ok(path.to_path_buf());
        }
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid protected secrets file name"))?;
        let quarantine_path = path.with_file_name(format!(
            "{file_name}.corrupt-{}",
            Utc::now().timestamp_millis()
        ));
        fs::rename(path, &quarantine_path)
            .await
            .context("quarantine damaged protected secrets")?;
        Ok(quarantine_path)
    }

    fn temp_path(&self) -> Result<PathBuf> {
        let file_name = self
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| anyhow!("Invalid protected secrets file name"))?;
        Ok(self
            .path
            .with_file_name(format!("{file_name}.{}.tmp", Uuid::new_v4())))
    }
}

#[cfg(test)]
mod tests {
    use tokio::fs;
    use uuid::Uuid;

    use crate::types::{ApiKeys, AppConfig, AuthTokens};

    use super::{SecretStore, StoredSecrets};

    #[test]
    fn reads_legacy_secrets_without_auth_revision() {
        let secrets: StoredSecrets = serde_json::from_value(serde_json::json!({
            "version": 1,
            "storageRevision": 4
        }))
        .unwrap();

        assert_eq!(secrets.auth_revision, 0);
        assert!(secrets.config.is_none());
    }

    #[test]
    fn validates_full_config_shadow() {
        let config = AppConfig {
            storage_revision: 5,
            auth_revision: 2,
            auth: AuthTokens {
                access: "access-token".to_string(),
                ..AuthTokens::default()
            },
            api_keys: ApiKeys {
                openai: "api-key".to_string(),
                ..ApiKeys::default()
            },
            ..AppConfig::default()
        };
        let secrets = StoredSecrets {
            storage_revision: config.storage_revision,
            auth_revision: config.auth_revision,
            auth: config.auth.clone(),
            api_keys: config.api_keys.clone(),
            config: Some(config),
            ..StoredSecrets::default()
        };

        assert!(secrets.config_shadow().is_some());
    }

    #[tokio::test]
    async fn quarantines_damaged_primary_and_backup() {
        let dir = std::env::temp_dir().join(format!("winky-secrets-test-{}", Uuid::new_v4()));
        let path = dir.join("secrets.bin");
        let backup_path = dir.join("secrets.bin.backup");
        fs::create_dir_all(&dir).await.unwrap();
        fs::write(&path, b"damaged-primary").await.unwrap();
        fs::write(&backup_path, b"damaged-backup").await.unwrap();

        let secrets = SecretStore::new(path.clone()).read().await.unwrap();

        assert!(secrets.is_none());
        assert!(fs::metadata(&path).await.is_err());
        assert!(fs::metadata(&backup_path).await.is_err());
        let mut entries = fs::read_dir(&dir).await.unwrap();
        let mut quarantined = 0;
        while let Some(entry) = entries.next_entry().await.unwrap() {
            if entry.file_name().to_string_lossy().contains(".corrupt-") {
                quarantined += 1;
            }
        }
        assert_eq!(quarantined, 2);

        fs::remove_dir_all(&dir).await.unwrap();
    }
}
