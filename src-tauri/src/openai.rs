use std::time::Duration;

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

const OPENAI_CHAT_COMPLETIONS_URL: &str = "https://api.openai.com/v1/chat/completions";

pub async fn chat_completions(api_key: &str, body: Value) -> Result<Value> {
    let token = api_key.trim();
    if token.is_empty() {
        return Err(anyhow!("OpenAI API key is missing."));
    }

    let client = reqwest::Client::new();
    let response = client
        .post(OPENAI_CHAT_COMPLETIONS_URL)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| anyhow!("Failed to send OpenAI request: {}", e))?;

    let status = response.status();
    let payload = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(anyhow!("OpenAI API returned {}: {}", status, payload));
    }

    serde_json::from_str(&payload)
        .map_err(|e| anyhow!("Failed to parse OpenAI response: {}", e))
}

pub async fn chat_completions_stream(
    app: AppHandle,
    api_key: &str,
    mut body: Value,
    stream_id: &str,
) -> Result<String> {
    let token = api_key.trim();
    if token.is_empty() {
        return Err(anyhow!("OpenAI API key is missing."));
    }

    if let Value::Object(map) = &mut body {
        map.insert("stream".into(), Value::Bool(true));
    } else {
        return Err(anyhow!("Invalid OpenAI request body."));
    }

    let client = reqwest::Client::new();
    let response = client
        .post(OPENAI_CHAT_COMPLETIONS_URL)
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| anyhow!("Failed to send OpenAI request: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let payload = response.text().await.unwrap_or_default();
        return Err(anyhow!("OpenAI API returned {}: {}", status, payload));
    }

    let mut full_text = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow!("OpenAI stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(pos) = buffer.find('\n') {
            let mut line = buffer[..pos].to_string();
            buffer = buffer[pos + 1..].to_string();
            if line.ends_with('\r') {
                line.pop();
            }
            let line = line.trim();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }
            let data = line.trim_start_matches("data:").trim();
            if data == "[DONE]" {
                let _ = app.emit(
                    "openai:stream",
                    serde_json::json!({"streamId": stream_id, "done": true}),
                );
                return Ok(full_text);
            }
            let parsed: Value = match serde_json::from_str(data) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let delta = parsed
                .get("choices")
                .and_then(|value| value.get(0))
                .and_then(|value| value.get("delta"))
                .and_then(|value| value.get("content"))
                .and_then(|value| value.as_str());
            if let Some(delta) = delta {
                full_text.push_str(delta);
                let _ = app.emit(
                    "openai:stream",
                    serde_json::json!({"streamId": stream_id, "delta": delta}),
                );
            }
        }
    }

    let _ = app.emit(
        "openai:stream",
        serde_json::json!({"streamId": stream_id, "done": true}),
    );
    Ok(full_text)
}
