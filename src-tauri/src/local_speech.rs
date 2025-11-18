use std::future::Future;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use reqwest::StatusCode;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};
use tokio::time::sleep;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::constants::{
    FAST_WHISPER_HEALTH_ENDPOINT, FAST_WHISPER_PORT, FAST_WHISPER_REPO_NAME, FAST_WHISPER_REPO_URL,
};
use crate::types::FastWhisperStatus;

const HEALTH_TIMEOUT: Duration = Duration::from_secs(120);
const HEALTH_INTERVAL: Duration = Duration::from_secs(2);
const STOP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct FastWhisperManager {
    status: Mutex<FastWhisperStatus>,
    lock: Mutex<()>,
}

impl FastWhisperManager {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(FastWhisperStatus::new("Local server is not installed.")),
            lock: Mutex::new(()),
        }
    }

    pub async fn get_status(&self) -> FastWhisperStatus {
        self.status.lock().await.clone()
    }

    pub async fn install_and_start(self: &Arc<Self>, app: &AppHandle) -> Result<FastWhisperStatus> {
        self.execute(app, |manager, handle| async move {
            manager.ensure_repository(&handle, false).await?;
            manager.start_server(&handle, "install").await
        })
        .await
    }

    pub async fn start_existing(self: &Arc<Self>, app: &AppHandle) -> Result<FastWhisperStatus> {
        self.execute(app, |manager, handle| async move {
            if !manager.repo_path(&handle).exists() {
                manager.ensure_repository(&handle, false).await?;
            }
            manager.start_server(&handle, "start").await
        })
        .await
    }

    pub async fn restart(self: &Arc<Self>, app: &AppHandle) -> Result<FastWhisperStatus> {
        self.execute(app, |manager, handle| async move {
            manager.stop_server(&handle).await.ok();
            manager.start_server(&handle, "restart").await
        })
        .await
    }

    pub async fn reinstall(self: &Arc<Self>, app: &AppHandle) -> Result<FastWhisperStatus> {
        self.execute(app, |manager, handle| async move {
            manager.ensure_repository(&handle, true).await?;
            manager.start_server(&handle, "reinstall").await
        })
        .await
    }

    pub async fn stop(self: &Arc<Self>, app: &AppHandle) -> Result<FastWhisperStatus> {
        self.execute(app, |manager, handle| async move {
            manager.stop_server(&handle).await?;
            manager.update_status(&handle, |status| {
                status.phase = "idle".into();
                status.running = false;
                status.message = "Server is stopped.".into();
            })
            .await;
            Ok(manager.get_status().await)
        })
        .await
    }

    async fn execute<F, Fut>(self: &Arc<Self>, app: &AppHandle, op: F) -> Result<FastWhisperStatus>
    where
        F: FnOnce(Arc<Self>, AppHandle) -> Fut + Send + 'static,
        Fut: Future<Output = Result<FastWhisperStatus>> + Send + 'static,
    {
        let _guard = self.lock.lock().await;
        let manager = Arc::clone(self);
        let app_handle = app.clone();
        match op(manager.clone(), app_handle.clone()).await {
            Ok(status) => Ok(status),
            Err(error) => {
                manager
                    .update_status(&app_handle, |state| {
                        state.phase = "error".into();
                        state.error = Some(error.to_string());
                        state.message = error.to_string();
                    })
                    .await;
                Err(error)
            }
        }
    }

    async fn update_status<F>(&self, app: &AppHandle, mut update: F)
    where
        F: FnMut(&mut FastWhisperStatus),
    {
        let mut guard = self.status.lock().await;
        update(&mut guard);
        guard.updated_at = chrono::Utc::now().timestamp_millis();
        let _ = app.emit("local-speech:status", guard.clone());
    }

    async fn ensure_repository(&self, app: &AppHandle, force: bool) -> Result<()> {
        let repo_dir = self.repo_path(app);
        println!(
            "[fast-fast-whisper] repository directory: {}",
            repo_dir.display()
        );
        if force {
            if repo_dir.exists() {
                tokio::fs::remove_dir_all(&repo_dir).await?;
            }
        }
        if repo_dir.exists() {
            return Ok(());
        }
        tokio::fs::create_dir_all(self.install_root(app)).await?;
        self.update_status(app, |state| {
            state.phase = "installing".into();
            state.installed = false;
            state.message = "Cloning repository…".into();
        })
        .await;
        let mut command = Command::new("git");
        command.arg("clone").arg(FAST_WHISPER_REPO_URL).arg(FAST_WHISPER_REPO_NAME);
        command.current_dir(self.install_root(app));
        command.envs(std::env::vars());
        let status = command.status().await?;
        if !status.success() {
            return Err(anyhow!("git clone exited with status {status}"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let scripts = ["start-unix.sh", "stop-unix.sh"];
            for script in scripts {
                let path = self.repo_path(app).join(script);
                if tokio::fs::metadata(&path).await.is_ok() {
                    let perms = std::fs::Permissions::from_mode(0o755);
                    let _ = tokio::fs::set_permissions(&path, perms).await;
                }
            }
        }
        self.update_status(app, |state| {
            state.installed = true;
            state.message = "Repository ready.".into();
        })
        .await;
        Ok(())
    }

    async fn start_server(self: &Arc<Self>, app: &AppHandle, action: &str) -> Result<FastWhisperStatus> {
        self.stop_server(app).await.ok();
        self.update_status(app, |state| {
            state.phase = "starting".into();
            state.running = false;
            state.error = None;
            state.message = "Starting local server…".into();
            state.log_line = None;
            state.installed = true;
        })
        .await;
        let (command, args) = self.start_command(app);
        let script_error = match self.run_script(app, &command, &args, "start").await {
            Ok(_) => None,
            Err(error) => {
                let message = error.to_string();
                self.update_status(app, |state| {
                    state.message = format!("start.bat reported: {message}");
                    state.error = Some(message.clone());
                })
                .await;
                Some(error)
            }
        };

        let health_result = self.wait_for_health(true).await;
        if let Err(error) = health_result {
            self.update_status(app, |state| {
                state.phase = "error".into();
                state.running = false;
                state.message = error.to_string();
                state.error = Some(error.to_string());
            })
            .await;
            return Err(script_error.unwrap_or(error));
        }
        // health ok even если скрипт ворчал
        if script_error.is_some() {
            self.update_status(app, |state| {
                state.error = None;
                state.message = "Server started with warnings.".into();
            })
            .await;
        }
        self.update_status(app, |state| {
            state.phase = "running".into();
            state.running = true;
            state.message = format!("Server {action}ed.");
            state.last_action = Some(action.into());
            state.last_success_at = Some(chrono::Utc::now().timestamp_millis());
        })
        .await;
        Ok(self.get_status().await)
    }

    async fn stop_server(self: &Arc<Self>, app: &AppHandle) -> Result<()> {
        if !self.repo_path(app).exists() {
            return Ok(());
        }
        let (command, args) = self.stop_command(app);
        let _ = self.run_script(app, &command, &args, "stop").await;
        let _ = self.wait_for_health(false).await;
        Ok(())
    }

    async fn run_script(self: &Arc<Self>, app: &AppHandle, command: &str, args: &[String], label: &str) -> Result<()> {
        let mut process = Command::new(command);
        process.args(args);
        process.current_dir(self.repo_path(app));
        process.envs(self.script_env());
        process.stdout(Stdio::piped());
        process.stderr(Stdio::piped());

        let mut child = process.spawn()?;
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        if let Some(stdout) = child.stdout.take() {
            let tx = tx.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = tx.send(line);
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let tx = tx.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = tx.send(line);
                }
            });
        }

        drop(tx);

        while let Some(line) = rx.recv().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let message = trimmed.to_string();
            self.update_status(app, |state| {
                state.log_line = Some(message.clone());
                if matches!(state.phase.as_str(), "installing" | "starting" | "reinstalling") {
                    state.message = message.clone();
                }
            })
            .await;
        }

        let status = child.wait().await?;
        if !status.success() {
            return Err(anyhow!("{label} script failed"));
        }

        Ok(())
    }

    async fn wait_for_health(&self, expect_up: bool) -> Result<()> {
        let client = reqwest::Client::builder().timeout(Duration::from_secs(5)).build()?;
        let started = Instant::now();
        let health_url = self.health_endpoint();
        loop {
            let healthy = client
                .get(&health_url)
                .send()
                .await
                .map(|response| response.status() == StatusCode::OK)
                .unwrap_or(false);
            if healthy == expect_up {
                return Ok(());
            }
            let timeout = if expect_up { HEALTH_TIMEOUT } else { STOP_TIMEOUT };
            if started.elapsed() > timeout {
                break;
            }
            sleep(HEALTH_INTERVAL).await;
        }
        if expect_up {
            Err(anyhow!("Local server did not start in time"))
        } else {
            Err(anyhow!("Local server is still running"))
        }
    }

    fn install_root(&self, app: &AppHandle) -> PathBuf {
        app.path()
            .app_local_data_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap())
    }

    fn repo_path(&self, app: &AppHandle) -> PathBuf {
        self.install_root(app).join(FAST_WHISPER_REPO_NAME)
    }

    fn start_command(&self, app: &AppHandle) -> (String, Vec<String>) {
        if cfg!(target_os = "windows") {
            (
                "cmd.exe".into(),
                vec!["/d".into(), "/s".into(), "/c".into(), "call".into(), "start.bat".into()],
            )
        } else {
            (
                "bash".into(),
                vec![self
                    .repo_path(app)
                    .join("start-unix.sh")
                    .to_string_lossy()
                    .to_string()],
            )
        }
    }

    fn stop_command(&self, app: &AppHandle) -> (String, Vec<String>) {
        if cfg!(target_os = "windows") {
            (
                "cmd.exe".into(),
                vec!["/d".into(), "/s".into(), "/c".into(), "call".into(), "stop.bat".into()],
            )
        } else {
            (
                "bash".into(),
                vec![self
                    .repo_path(app)
                    .join("stop-unix.sh")
                    .to_string_lossy()
                    .to_string()],
            )
        }
    }

    fn script_env(&self) -> Vec<(String, String)> {
        let mut env: Vec<(String, String)> = std::env::vars().collect();
        env.push(("PAUSE_SECONDS".into(), "0".into()));
        env.push(("FAST_FAST_WHISPER_PORT".into(), Self::resolve_port().to_string()));
        env.push(("FAST_FAST_WHISPER_HOST".into(), Self::resolve_host()));
        env
    }

    fn resolve_port() -> u16 {
        std::env::var("FAST_FAST_WHISPER_PORT")
            .or_else(|_| std::env::var("PORT"))
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(FAST_WHISPER_PORT)
    }

    fn resolve_host() -> String {
        std::env::var("FAST_FAST_WHISPER_HOST")
            .or_else(|_| std::env::var("HOST"))
            .unwrap_or_else(|_| "127.0.0.1".into())
    }

    fn health_endpoint(&self) -> String {
        let host = Self::resolve_host();
        let port = Self::resolve_port();
        if host == "127.0.0.1" && port == FAST_WHISPER_PORT {
            FAST_WHISPER_HEALTH_ENDPOINT.into()
        } else {
            format!("http://{}:{}/health", host, port)
        }
    }
}
