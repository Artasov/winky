use std::collections::HashMap;
use std::future::Future;
use std::io;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::oneshot;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const OLLAMA_BASE_URL: &str = "http://localhost:11434";

enum RequestCancellation {
    Active(oneshot::Sender<()>),
    Cancelled(Instant),
}

static REQUEST_CANCELLATIONS: Lazy<Mutex<HashMap<String, RequestCancellation>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
const CANCEL_TOMBSTONE_TTL: Duration = Duration::from_secs(30);

fn store_cancelled_request(request_id: &str, requests: &mut HashMap<String, RequestCancellation>) {
    let cancelled_at = Instant::now();
    requests.insert(
        request_id.to_string(),
        RequestCancellation::Cancelled(cancelled_at),
    );

    let cleanup_id = request_id.to_string();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(CANCEL_TOMBSTONE_TTL).await;
        if let Ok(mut requests) = REQUEST_CANCELLATIONS.lock() {
            let is_expired = matches!(
                requests.get(&cleanup_id),
                Some(RequestCancellation::Cancelled(stored_at)) if *stored_at == cancelled_at
            );
            if is_expired {
                requests.remove(&cleanup_id);
            }
        }
    });
}

fn request_cancel_receiver(request_id: &str) -> Result<Option<oneshot::Receiver<()>>> {
    let mut requests = REQUEST_CANCELLATIONS
        .lock()
        .map_err(|_| anyhow!("Ollama cancellation registry is unavailable"))?;

    if matches!(
        requests.remove(request_id),
        Some(RequestCancellation::Cancelled(_))
    ) {
        return Ok(None);
    }

    let (sender, receiver) = oneshot::channel();
    requests.insert(request_id.to_string(), RequestCancellation::Active(sender));
    Ok(Some(receiver))
}

fn clear_request(request_id: &str) {
    if let Ok(mut requests) = REQUEST_CANCELLATIONS.lock() {
        requests.remove(request_id);
    }
}

async fn run_cancellable_request<T>(
    request_id: &str,
    operation: impl Future<Output = Result<T>>,
) -> Result<T> {
    let Some(mut cancel_receiver) = request_cancel_receiver(request_id)? else {
        return Err(anyhow!("Ollama request cancelled"));
    };

    tokio::pin!(operation);
    let result = tokio::select! {
        _ = &mut cancel_receiver => Err(anyhow!("Ollama request cancelled")),
        result = &mut operation => result,
    };
    clear_request(request_id);
    result
}

pub fn cancel_request(request_id: &str) -> Result<()> {
    let mut requests = REQUEST_CANCELLATIONS
        .lock()
        .map_err(|_| anyhow!("Ollama cancellation registry is unavailable"))?;

    match requests.remove(request_id) {
        Some(RequestCancellation::Active(sender)) => {
            let _ = sender.send(());
        }
        Some(RequestCancellation::Cancelled(_)) | None => {
            store_cancelled_request(request_id, &mut requests);
        }
    }
    Ok(())
}

/// Check if Ollama server is running by making an HTTP request
pub async fn is_server_running() -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Try to get version from the API
    let url = format!("{}/api/version", OLLAMA_BASE_URL);
    match client.get(&url).send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// Check if Ollama CLI is installed (without starting the server)
pub async fn check_installed() -> Result<bool> {
    // First, check if server is already running
    if is_server_running().await {
        return Ok(true);
    }

    // If server is not running, check if CLI exists by looking for the executable
    // We use `where` on Windows or `which` on Unix to find the executable
    // without actually running ollama (which would start the server)
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("where");
        cmd.arg("ollama")
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd.creation_flags(CREATE_NO_WINDOW);

        match cmd.status().await {
            Ok(status) => Ok(status.success()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("which");
        cmd.arg("ollama")
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        match cmd.status().await {
            Ok(status) => Ok(status.success()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.into()),
        }
    }
}

#[derive(Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

/// List models using HTTP API (does not start Ollama server)
pub async fn list_models() -> Result<Vec<String>> {
    // Only use HTTP API - never use CLI to avoid starting multiple instances
    if !is_server_running().await {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| anyhow!("Failed to create HTTP client: {}", e))?;

    let url = format!("{}/api/tags", OLLAMA_BASE_URL);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| anyhow!("Failed to connect to Ollama API: {}", e))?;

    if !response.status().is_success() {
        return Err(anyhow!(
            "Ollama API returned error status: {}",
            response.status()
        ));
    }

    let tags_response: OllamaTagsResponse = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse Ollama response: {}", e))?;

    let names = tags_response
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();

    Ok(names)
}

pub async fn pull_model(model: &str) -> Result<()> {
    if model.trim().is_empty() {
        return Err(anyhow!("Model name is empty"));
    }

    // Check if server is running before trying to pull
    if !is_server_running().await {
        return Err(anyhow!(
            "Ollama server is not running. Please start Ollama first."
        ));
    }

    let mut cmd = Command::new("ollama");
    cmd.args(["pull", model])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let status = cmd.status().await?;
    if !status.success() {
        return Err(anyhow!("ollama pull failed"));
    }
    Ok(())
}

pub async fn warmup_model(model: &str) -> Result<()> {
    // Check if server is running before trying to warmup
    if !is_server_running().await {
        return Err(anyhow!(
            "Ollama server is not running. Please start Ollama first."
        ));
    }

    // A lightweight "warmup": ensure the model is pulled; actual prompt
    // warmup can be added later if needed.
    pull_model(model).await
}

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub async fn chat_completions(
    model: &str,
    messages: Vec<ChatMessage>,
    request_id: &str,
) -> Result<serde_json::Value> {
    run_cancellable_request(request_id, async move {
        if !is_server_running().await {
            return Err(anyhow!(
                "Ollama server is not running. Please start Ollama first."
            ));
        }

        let client = reqwest::Client::new();
        let url = format!("{}/v1/chat/completions", OLLAMA_BASE_URL);
        let request = serde_json::json!({
            "model": model,
            "messages": messages
        });
        let response = client
            .post(&url)
            .json(&request)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to send request to Ollama: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Ollama API returned error status {}: {}",
                status,
                error_text
            ));
        }

        response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Ollama response: {}", e))
    })
    .await
}

pub async fn chat_completions_stream(
    app: AppHandle,
    model: &str,
    messages: Vec<ChatMessage>,
    stream_id: &str,
    request_id: &str,
) -> Result<String> {
    run_cancellable_request(request_id, async move {
        if !is_server_running().await {
            return Err(anyhow!(
                "Ollama server is not running. Please start Ollama first."
            ));
        }

        let client = reqwest::Client::new();
        let url = format!("{}/v1/chat/completions", OLLAMA_BASE_URL);

        let request = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true
        });

        let response = client
            .post(&url)
            .json(&request)
            .timeout(Duration::from_secs(120))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to send request to Ollama: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Ollama API returned error status {}: {}",
                status,
                error_text
            ));
        }

        let mut full_text = String::new();
        let mut buffer = String::new();
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| anyhow!("Ollama stream error: {}", e))?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            while let Some(pos) = buffer.find('\n') {
                let mut line = buffer[..pos].to_string();
                buffer = buffer[pos + 1..].to_string();
                if line.ends_with('\r') {
                    line.pop();
                }
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                let data = if let Some(rest) = line.strip_prefix("data:") {
                    rest.trim()
                } else {
                    line
                };

                if data == "[DONE]" {
                    let _ = app.emit(
                        "ollama:stream",
                        serde_json::json!({"streamId": stream_id, "done": true}),
                    );
                    return Ok(full_text);
                }

                let parsed: serde_json::Value = match serde_json::from_str(data) {
                    Ok(value) => value,
                    Err(_) => continue,
                };

                let delta = parsed
                    .get("choices")
                    .and_then(|value| value.get(0))
                    .and_then(|value| value.get("delta"))
                    .and_then(|value| value.get("content"))
                    .and_then(|value| value.as_str())
                    .or_else(|| {
                        parsed
                            .get("choices")
                            .and_then(|value| value.get(0))
                            .and_then(|value| value.get("message"))
                            .and_then(|value| value.get("content"))
                            .and_then(|value| value.as_str())
                    })
                    .or_else(|| {
                        parsed
                            .get("message")
                            .and_then(|value| value.get("content"))
                            .and_then(|value| value.as_str())
                    });

                if let Some(delta) = delta {
                    full_text.push_str(delta);
                    let _ = app.emit(
                        "ollama:stream",
                        serde_json::json!({"streamId": stream_id, "delta": delta}),
                    );
                }
            }
        }

        let _ = app.emit(
            "ollama:stream",
            serde_json::json!({"streamId": stream_id, "done": true}),
        );
        Ok(full_text)
    })
    .await
}
