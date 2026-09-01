mod manifest;

use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};

use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use once_cell::sync::Lazy;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{io::AsyncWriteExt, sync::Mutex};

use crate::auth::AUTH_OWNER_WINDOW_LABEL;
use crate::constants::{
    UPDATE_CHECK_INTERVAL_SECS, UPDATE_INITIAL_CHECK_DELAY_SECS, UPDATE_MANIFEST_URL,
    UPDATE_MAX_BACKOFF_SECS,
};
use manifest::{
    automatic_install_supported, build_download_http_client, build_manifest_http_client,
    latest_version, load_manifest, parse_version, select_update_candidate, UpdateCandidate,
};

const UPDATE_AVAILABLE_EVENT: &str = "update-available";
const UPDATE_PROGRESS_EVENT: &str = "update-download-progress";
const UPDATE_STARTED_EVENT: &str = "update-started";
const UPDATE_ERROR_EVENT: &str = "update-error";
const UPDATE_STATE_EVENT: &str = "update-state-changed";
const UPDATE_INSTALL_RESULT_FILE: &str = "update-install-result.txt";
const UPDATE_CONNECT_TIMEOUT_SECS: u64 = 15;
const UPDATE_REQUEST_TIMEOUT_SECS: u64 = 60;
const UPDATE_DOWNLOAD_READ_TIMEOUT_SECS: u64 = 60;

static UPDATE_STATE: Lazy<Mutex<UpdaterState>> = Lazy::new(|| Mutex::new(UpdaterState::default()));
static UPDATE_OPERATION: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static UPDATE_CHECK_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Checking,
    Available,
    Unsupported,
    Downloading,
    Ready,
    Installing,
    Error,
}

#[derive(Debug, Default)]
struct UpdaterState {
    phase: UpdatePhase,
    update_available: bool,
    latest_version: Option<String>,
    candidate: Option<UpdateCandidate>,
    downloaded_path: Option<PathBuf>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub update_available: bool,
    pub version: Option<String>,
    pub file_name: Option<String>,
    pub phase: UpdatePhase,
    pub install_supported: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadResult {
    pub version: String,
    pub file_name: String,
    pub ready: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateAvailablePayload {
    version: String,
    current_version: String,
    file_name: Option<String>,
    install_supported: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateProgressPayload {
    version: String,
    percent: u64,
    downloaded_bytes: u64,
    total_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateStartedPayload {
    version: String,
    file_name: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateErrorPayload {
    message: String,
}

struct UpdateCheckGuard;

impl Drop for UpdateCheckGuard {
    fn drop(&mut self) {
        UPDATE_CHECK_IN_PROGRESS.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> std::result::Result<UpdateCheckResult, String> {
    check_for_updates(&app, true).await.map_err(|error| {
        log::error!(target: "update", "Manual update check failed: {error}");
        error.to_string()
    })
}

#[tauri::command]
pub async fn get_update_state() -> UpdateCheckResult {
    state_snapshot().await
}

#[tauri::command]
pub async fn download_app_update(
    app: AppHandle,
) -> std::result::Result<UpdateDownloadResult, String> {
    download_update(&app).await.map_err(|error| {
        log::error!(target: "update", "Update download failed: {error}");
        error.to_string()
    })
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    window: tauri::WebviewWindow,
    confirmed: bool,
) -> std::result::Result<(), String> {
    if window.label() != AUTH_OWNER_WINDOW_LABEL {
        return Err("Updates can only be installed by the main window".to_string());
    }
    install_ready_update(&app, confirmed)
        .await
        .map_err(|error| {
            log::error!(target: "update", "Update installation failed: {error}");
            error.to_string()
        })
}

pub fn start_update_poll(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(UPDATE_INITIAL_CHECK_DELAY_SECS)).await;
        let mut next_delay = UPDATE_CHECK_INTERVAL_SECS;

        loop {
            match check_for_updates(&app, false).await {
                Ok(_) => next_delay = UPDATE_CHECK_INTERVAL_SECS,
                Err(error) => {
                    log::warn!(target: "update", "Background update check failed: {error}");
                    next_delay = next_delay.saturating_mul(2).min(UPDATE_MAX_BACKOFF_SECS);
                }
            }
            tokio::time::sleep(Duration::from_secs(next_delay)).await;
        }
    });
}

pub async fn load_install_result(app: &AppHandle) {
    let message = match take_install_result(app) {
        Ok(Some(exit_code)) => install_result_message(exit_code),
        Ok(None) => None,
        Err(error) => Some(format!(
            "The previous update result could not be read: {error}"
        )),
    };
    let Some(message) = message else {
        return;
    };

    log::error!(target: "update", "{message}");
    let mut state = UPDATE_STATE.lock().await;
    state.phase = UpdatePhase::Error;
    state.last_error = Some(message);
}

async fn check_for_updates(app: &AppHandle, emit_errors: bool) -> Result<UpdateCheckResult> {
    if cfg!(debug_assertions) && std::env::var("WINKY_ENABLE_DEBUG_UPDATER").is_err() {
        return Ok(state_snapshot().await);
    }
    if UPDATE_CHECK_IN_PROGRESS
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(state_snapshot().await);
    }
    let _guard = UpdateCheckGuard;
    let _operation_guard = UPDATE_OPERATION.lock().await;

    {
        let state = UPDATE_STATE.lock().await;
        if matches!(
            state.phase,
            UpdatePhase::Downloading | UpdatePhase::Ready | UpdatePhase::Installing
        ) {
            return Ok(snapshot_from_state(&state));
        }
    }
    set_phase(app, UpdatePhase::Checking, None).await;

    let result = check_manifest(app).await;
    if let Err(error) = &result {
        set_phase(app, UpdatePhase::Error, Some(error.to_string())).await;
        if emit_errors {
            emit_update_error(app, error.to_string());
        }
    }
    result
}

async fn check_manifest(app: &AppHandle) -> Result<UpdateCheckResult> {
    let client = build_manifest_http_client(
        Duration::from_secs(UPDATE_REQUEST_TIMEOUT_SECS),
        Duration::from_secs(UPDATE_CONNECT_TIMEOUT_SECS),
    )?;
    let Some(manifest) = load_manifest(&client, UPDATE_MANIFEST_URL).await? else {
        reset_state(app).await;
        return Ok(state_snapshot().await);
    };

    let current_version = parse_version(&app.package_info().version.to_string())?;
    let version = latest_version(&manifest)?;
    let version_string = version.to_string();
    if version <= current_version {
        let mut state = UPDATE_STATE.lock().await;
        *state = UpdaterState::default();
        state.latest_version = Some(version_string);
        drop(state);
        emit_state(app).await;
        let state = UPDATE_STATE.lock().await;
        return Ok(snapshot_from_state(&state));
    }

    let candidate = select_update_candidate(&manifest, UPDATE_MANIFEST_URL)?;
    let previous_version = {
        let state = UPDATE_STATE.lock().await;
        state.latest_version.clone()
    };

    let file_name = candidate.as_ref().map(|item| item.file_name.clone());
    let install_supported = candidate.is_some() && automatic_install_supported();
    {
        let mut state = UPDATE_STATE.lock().await;
        state.phase = if install_supported {
            UpdatePhase::Available
        } else {
            UpdatePhase::Unsupported
        };
        state.update_available = true;
        state.latest_version = Some(version_string.clone());
        state.candidate = candidate;
        state.downloaded_path = None;
        state.last_error = if install_supported {
            None
        } else {
            Some("Automatic installation is not supported for this platform".to_string())
        };
    }
    emit_state(app).await;

    if previous_version.as_deref() != Some(version_string.as_str()) {
        let _ = app.emit(
            UPDATE_AVAILABLE_EVENT,
            UpdateAvailablePayload {
                version: version_string,
                current_version: current_version.to_string(),
                file_name,
                install_supported,
            },
        );
    }
    Ok(state_snapshot().await)
}

async fn download_update(app: &AppHandle) -> Result<UpdateDownloadResult> {
    let _operation_guard = UPDATE_OPERATION.lock().await;
    let candidate = {
        let mut state = UPDATE_STATE.lock().await;
        if !automatic_install_supported() {
            return Err(anyhow!(
                "Automatic update download is not supported on this platform"
            ));
        }
        if matches!(
            state.phase,
            UpdatePhase::Downloading | UpdatePhase::Installing
        ) {
            return Err(anyhow!("Another update operation is already running"));
        }
        let candidate = state
            .candidate
            .clone()
            .ok_or_else(|| anyhow!("Check for updates before starting a download"))?;
        state.phase = UpdatePhase::Downloading;
        state.last_error = None;
        candidate
    };
    emit_state(app).await;

    let result = download_candidate(app, &candidate).await;
    match result {
        Ok(path) => {
            let mut state = UPDATE_STATE.lock().await;
            state.phase = UpdatePhase::Ready;
            state.downloaded_path = Some(path);
            state.last_error = None;
            drop(state);
            emit_state(app).await;
            Ok(UpdateDownloadResult {
                version: candidate.version.to_string(),
                file_name: candidate.file_name,
                ready: true,
            })
        }
        Err(error) => {
            set_phase(app, UpdatePhase::Available, Some(error.to_string())).await;
            emit_update_error(app, error.to_string());
            Err(error)
        }
    }
}

async fn download_candidate(app: &AppHandle, candidate: &UpdateCandidate) -> Result<PathBuf> {
    cleanup_old_updates(app, &candidate.version.to_string())?;
    let destination = update_download_path(app, candidate)?;
    let partial = destination.with_file_name(format!("{}.part", candidate.file_name));
    remove_file_if_exists(&partial)?;

    if destination.is_file() && verify_candidate_file(&destination, candidate).is_ok() {
        return Ok(destination);
    }
    remove_file_if_exists(&destination)?;

    let client = build_download_http_client(
        Duration::from_secs(UPDATE_CONNECT_TIMEOUT_SECS),
        Duration::from_secs(UPDATE_DOWNLOAD_READ_TIMEOUT_SECS),
    )?;
    if let Err(error) = download_with_progress(app, &client, candidate, &partial).await {
        let _ = remove_file_if_exists(&partial);
        return Err(error);
    }

    let verify_path = partial.clone();
    let verify_candidate = candidate.clone();
    tokio::task::spawn_blocking(move || verify_candidate_file(&verify_path, &verify_candidate))
        .await
        .context("Update verification task failed")??;
    tokio::fs::rename(&partial, &destination).await?;
    Ok(destination)
}

async fn install_ready_update(app: &AppHandle, confirmed: bool) -> Result<()> {
    if !confirmed {
        return Err(anyhow!(
            "Update installation requires explicit confirmation"
        ));
    }
    if !automatic_install_supported() {
        return Err(anyhow!(
            "Automatic update installation is not supported on this platform"
        ));
    }
    let _operation_guard = UPDATE_OPERATION.lock().await;

    let (candidate, installer_path) = {
        let mut state = UPDATE_STATE.lock().await;
        if state.phase != UpdatePhase::Ready {
            return Err(anyhow!(
                "Download and verify the update before installation"
            ));
        }
        let candidate = state
            .candidate
            .clone()
            .ok_or_else(|| anyhow!("Update candidate is missing"))?;
        let installer_path = state
            .downloaded_path
            .clone()
            .ok_or_else(|| anyhow!("Downloaded update path is missing"))?;
        state.phase = UpdatePhase::Installing;
        state.last_error = None;
        (candidate, installer_path)
    };
    emit_state(app).await;

    let verify_path = installer_path.clone();
    let verify_candidate = candidate.clone();
    let verification = match tokio::task::spawn_blocking(move || {
        verify_candidate_file(&verify_path, &verify_candidate)
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(anyhow!("Update verification task failed: {error}")),
    };
    if let Err(error) = verification {
        set_phase(app, UpdatePhase::Ready, Some(error.to_string())).await;
        emit_update_error(app, error.to_string());
        return Err(error);
    }

    let _ = app.emit(
        UPDATE_STARTED_EVENT,
        UpdateStartedPayload {
            version: candidate.version.to_string(),
            file_name: candidate.file_name.clone(),
        },
    );
    if let Err(error) = install_update(app, &installer_path, &candidate).await {
        set_phase(app, UpdatePhase::Ready, Some(error.to_string())).await;
        emit_update_error(app, error.to_string());
        return Err(error);
    }
    Ok(())
}

async fn download_with_progress(
    app: &AppHandle,
    client: &reqwest::Client,
    candidate: &UpdateCandidate,
    destination: &Path,
) -> Result<()> {
    let response = client
        .get(&candidate.file_url)
        .send()
        .await
        .with_context(|| format!("Failed to download update: {}", candidate.file_url))?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "Failed to download update: HTTP {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size != candidate.expected_size)
    {
        return Err(anyhow!("Update size does not match the signed manifest"));
    }

    let mut file = tokio::fs::File::create(destination).await?;
    let mut downloaded = 0u64;
    let mut last_percent = 0u64;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        downloaded = downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| anyhow!("Downloaded update size overflow"))?;
        if downloaded > candidate.expected_size {
            return Err(anyhow!("Update exceeds the size from the signed manifest"));
        }
        file.write_all(&chunk).await?;

        let percent = ((downloaded as f64 / candidate.expected_size as f64) * 100.0)
            .round()
            .min(100.0) as u64;
        if percent > last_percent {
            let _ = app.emit(
                UPDATE_PROGRESS_EVENT,
                UpdateProgressPayload {
                    version: candidate.version.to_string(),
                    percent,
                    downloaded_bytes: downloaded,
                    total_bytes: candidate.expected_size,
                },
            );
            last_percent = percent;
        }
    }

    if downloaded != candidate.expected_size {
        return Err(anyhow!("Downloaded update is incomplete"));
    }
    file.flush().await?;
    file.sync_all().await?;
    Ok(())
}

fn verify_candidate_file(path: &Path, candidate: &UpdateCandidate) -> Result<()> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() != candidate.expected_size {
        return Err(anyhow!("Downloaded update has an unexpected size"));
    }
    let hash = sha256_hex_file(path)?;
    if hash != candidate.expected_hash {
        return Err(anyhow!(
            "Downloaded update hash does not match the signed manifest"
        ));
    }
    Ok(())
}

fn sha256_hex_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn update_root(app: &AppHandle) -> Result<PathBuf> {
    let mut path = app
        .path()
        .app_local_data_dir()
        .context("Failed to resolve app local data directory")?;
    path.push("updates");
    Ok(path)
}

fn install_result_path(app: &AppHandle) -> Result<PathBuf> {
    let root = app
        .path()
        .app_local_data_dir()
        .context("Failed to resolve app local data directory")?;
    fs::create_dir_all(&root)?;
    Ok(root.join(UPDATE_INSTALL_RESULT_FILE))
}

fn take_install_result(app: &AppHandle) -> Result<Option<i32>> {
    let path = install_result_path(app)?;
    let value = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    remove_file_if_exists(&path).context("Failed to remove the consumed update result marker")?;
    parse_install_result(&value).map(Some)
}

fn parse_install_result(value: &str) -> Result<i32> {
    value
        .trim()
        .parse::<i32>()
        .context("Update result marker does not contain a valid exit code")
}

fn install_result_message(exit_code: i32) -> Option<String> {
    match exit_code {
        0 | 1641 | 3010 => None,
        1223 | 1602 => Some(
            "Update installation was canceled. Winky was reopened without applying the update."
                .to_string(),
        ),
        _ => Some(format!(
            "Update installer failed with exit code {exit_code}. Winky was reopened without applying the update."
        )),
    }
}

fn update_download_path(app: &AppHandle, candidate: &UpdateCandidate) -> Result<PathBuf> {
    let mut path = update_root(app)?;
    path.push(candidate.version.to_string());
    fs::create_dir_all(&path)?;
    Ok(path.join(&candidate.file_name))
}

fn cleanup_old_updates(app: &AppHandle, current_version: &str) -> Result<()> {
    let root = update_root(app)?;
    fs::create_dir_all(&root)?;
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        if entry.file_name().to_string_lossy() == current_version {
            continue;
        }
        let file_type = entry.file_type()?;
        if file_type.is_dir() && !file_type.is_symlink() {
            fs::remove_dir_all(entry.path())?;
        } else {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn remove_file_if_exists(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Err(anyhow!(
            "Update download path unexpectedly points to a directory"
        )),
        Ok(_) => {
            fs::remove_file(path)?;
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

async fn state_snapshot() -> UpdateCheckResult {
    let state = UPDATE_STATE.lock().await;
    snapshot_from_state(&state)
}

fn snapshot_from_state(state: &UpdaterState) -> UpdateCheckResult {
    UpdateCheckResult {
        update_available: state.update_available,
        version: state.latest_version.clone(),
        file_name: state
            .candidate
            .as_ref()
            .map(|candidate| candidate.file_name.clone()),
        phase: state.phase,
        install_supported: state.candidate.is_some() && automatic_install_supported(),
        message: state.last_error.clone(),
    }
}

async fn set_phase(app: &AppHandle, phase: UpdatePhase, message: Option<String>) {
    let mut state = UPDATE_STATE.lock().await;
    state.phase = phase;
    state.last_error = message;
    drop(state);
    emit_state(app).await;
}

async fn reset_state(app: &AppHandle) {
    let mut state = UPDATE_STATE.lock().await;
    *state = UpdaterState::default();
    drop(state);
    emit_state(app).await;
}

async fn emit_state(app: &AppHandle) {
    let payload = state_snapshot().await;
    let _ = app.emit(UPDATE_STATE_EVENT, payload);
}

fn emit_update_error(app: &AppHandle, message: String) {
    let _ = app.emit(UPDATE_ERROR_EVENT, UpdateErrorPayload { message });
}

#[cfg(target_os = "windows")]
async fn install_update(
    app: &AppHandle,
    installer: &Path,
    candidate: &UpdateCandidate,
) -> Result<()> {
    let installer_extension = installer
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(installer_extension.as_str(), "exe" | "msi") {
        return Err(anyhow!("Unsupported Windows installer type"));
    }

    let current_exe = std::env::current_exe()?;
    let script_dir = installer
        .parent()
        .ok_or_else(|| anyhow!("Installer directory is missing"))?;
    let script_path = script_dir.join("install-update.bat");
    let result_path = install_result_path(app)?;
    remove_file_if_exists(&result_path)?;
    let installer_value = batch_value(installer)?;
    let executable_value = batch_value(&current_exe)?;
    let result_value = batch_value(&result_path)?;
    let current_pid = std::process::id();
    let content = format!(
        "@echo off\r\n\
setlocal DisableDelayedExpansion\r\n\
set \"INSTALLER={installer_value}\"\r\n\
set \"INSTALLER_EXT={installer_extension}\"\r\n\
set \"APP_EXE={executable_value}\"\r\n\
set \"RESULT_FILE={result_value}\"\r\n\
set \"APP_PID={current_pid}\"\r\n\
:wait_app_exit\r\n\
tasklist /FI \"PID eq %APP_PID%\" 2>NUL | find \"%APP_PID%\" >NUL\r\n\
if not errorlevel 1 (\r\n\
  timeout /t 1 /nobreak >nul\r\n\
  goto wait_app_exit\r\n\
)\r\n\
if /I \"%INSTALLER_EXT%\"==\"msi\" (\r\n\
  start \"\" /wait msiexec /i \"%INSTALLER%\" /qn /norestart\r\n\
) else (\r\n\
  start \"\" /wait \"%INSTALLER%\" /S\r\n\
)\r\n\
set \"INSTALL_EXIT=%ERRORLEVEL%\"\r\n\
>\"%RESULT_FILE%\" echo %INSTALL_EXIT%\r\n\
start \"\" \"%APP_EXE%\"\r\n\
del \"%~f0\"\r\n\
exit /b %INSTALL_EXIT%\r\n"
    );
    let verification_script = format!(
        "$installer=$args[0]; $expectedHash=$args[1]; $actualHash=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant(); if ($actualHash -ne $expectedHash) {{ Write-Error 'Installer hash changed before launch'; exit 10 }}\" \"%INSTALLER%\" \"{}",
        candidate.expected_hash
    );
    let verification_command = format!(
        "powershell.exe -NoProfile -NonInteractive -Command \"{verification_script}\"\r\n\
if errorlevel 1 (\r\n\
  >\"%RESULT_FILE%\" echo 9001\r\n\
  start \"\" \"%APP_EXE%\"\r\n\
  del \"%~f0\"\r\n\
  exit /b 9001\r\n\
)\r\n"
    );
    let install_marker = "if /I \"%INSTALLER_EXT%\"==\"msi\" (";
    if !content.contains(install_marker) {
        return Err(anyhow!("Update installer helper template is invalid"));
    }
    let content = content.replacen(
        install_marker,
        &format!("{verification_command}{install_marker}"),
        1,
    );
    fs::write(&script_path, content)?;

    let mut command = Command::new("cmd.exe");
    command.args(["/C", script_path.to_string_lossy().as_ref()]);
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    app.exit(0);
    Ok(())
}

#[cfg(target_os = "windows")]
fn batch_value(path: &Path) -> Result<String> {
    let value = path
        .to_str()
        .ok_or_else(|| anyhow!("Windows update path is not valid Unicode"))?;
    if value
        .chars()
        .any(|character| matches!(character, '\r' | '\n' | '"'))
    {
        return Err(anyhow!(
            "Windows update path contains unsupported characters"
        ));
    }
    Ok(value.replace('%', "%%"))
}

#[cfg(not(target_os = "windows"))]
async fn install_update(
    _app: &AppHandle,
    _installer: &Path,
    _candidate: &UpdateCandidate,
) -> Result<()> {
    Err(anyhow!(
        "Automatic installation is currently supported only on Windows"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_directory_as_partial_file() {
        let root = std::env::temp_dir().join(format!("winky-update-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();

        assert!(remove_file_if_exists(&root).is_err());
        fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn parses_install_result_and_classifies_exit_codes() {
        assert_eq!(parse_install_result("0\r\n").unwrap(), 0);
        assert!(install_result_message(0).is_none());
        assert!(install_result_message(3010).is_none());
        assert!(install_result_message(1223).unwrap().contains("canceled"));
        assert!(install_result_message(5).unwrap().contains("exit code 5"));
        assert!(parse_install_result("invalid").is_err());
    }
}
