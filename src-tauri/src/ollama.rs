use std::io;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::Stdio;

use anyhow::{anyhow, Result};
use serde::Deserialize;
use tokio::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub async fn check_installed() -> Result<bool> {
    let mut cmd = Command::new("ollama");
    cmd.arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let spawn_result = cmd.spawn();

    let mut child = match spawn_result {
        Ok(child) => child,
        Err(error) => {
            return if error.kind() == io::ErrorKind::NotFound {
                Ok(false)
            } else {
                Err(error.into())
            };
        }
    };

    let status = child.wait().await?;
    Ok(status.success())
}

#[derive(Deserialize)]
struct OllamaModel {
    name: String,
}

pub async fn list_models() -> Result<Vec<String>> {
    if !check_installed().await? {
        return Ok(Vec::new());
    }

    // Prefer JSON output (available in recent ollama versions).
    let mut cmd = Command::new("ollama");
    cmd.args(["list", "--format", "json"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let json_output = cmd.output().await;

    if let Ok(output) = &json_output {
        if output.status.success() {
            if let Ok(models) = serde_json::from_slice::<Vec<OllamaModel>>(&output.stdout) {
                return Ok(models.into_iter().map(|m| m.name).collect());
            }
        }
    }

    // Fallback to plain-text parsing.
    let mut cmd = Command::new("ollama");
    cmd.arg("list");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().await?;
    if !output.status.success() {
        return Err(anyhow!("ollama list failed"));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut names = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("NAME") {
            continue;
        }
        if let Some(name) = trimmed.split_whitespace().next() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

pub async fn pull_model(model: &str) -> Result<()> {
    if model.trim().is_empty() {
        return Err(anyhow!("Model name is empty"));
    }
    let mut cmd = Command::new("ollama");
    cmd.args(["pull", model])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let status = cmd.status().await?;
    if !status.success() {
        return Err(anyhow!("ollama pull failed"));
    }
    Ok(())
}

pub async fn warmup_model(model: &str) -> Result<()> {
    // A lightweight "warmup": ensure the model is pulled; actual prompt
    // warmup can be added later if needed.
    pull_model(model).await
}
