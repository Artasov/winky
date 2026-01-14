use std::time::Duration;

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use reqwest::header::{ACCEPT, CONTENT_TYPE};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

fn extract_text(payload: &Value) -> String {
    if let Some(items) = payload.as_array() {
        return items.iter().map(extract_text).collect::<Vec<_>>().join("");
    }

    let mut text = String::new();

    if let Some(candidates) = payload.get("candidates").and_then(|value| value.as_array()) {
        for candidate in candidates {
            if let Some(parts) = candidate
                .get("content")
                .and_then(|value| value.get("parts"))
                .and_then(|value| value.as_array())
            {
                for part in parts {
                    if let Some(piece) = part.get("text").and_then(|value| value.as_str()) {
                        text.push_str(piece);
                    }
                }
            }
        }
    }

    if text.is_empty() {
        if let Some(piece) = payload.get("text").and_then(|value| value.as_str()) {
            text.push_str(piece);
        }
    }

    text
}

pub async fn stream_generate_content(
    app: AppHandle,
    api_key: &str,
    model: &str,
    body: Value,
    stream_id: &str,
) -> Result<String> {
    let token = api_key.trim();
    if token.is_empty() {
        return Err(anyhow!("Google AI API key is missing."));
    }
    if model.trim().is_empty() {
        return Err(anyhow!("Gemini model is missing."));
    }

    let client = reqwest::Client::new();
    let url = format!(
        "{}/{}:streamGenerateContent?key={}&alt=sse",
        GEMINI_BASE_URL, model, token
    );

    let response = client
        .post(&url)
        .header(ACCEPT, "text/event-stream")
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| anyhow!("Failed to send Gemini request: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let payload = response.text().await.unwrap_or_default();
        return Err(anyhow!("Gemini API returned {}: {}", status, payload));
    }

    let mut full_text = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow!("Gemini stream error: {}", e))?;
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
                    "gemini:stream",
                    serde_json::json!({"streamId": stream_id, "done": true}),
                );
                return Ok(full_text);
            }

            if data == "[" || data == "]" {
                continue;
            }

            let parsed: Value = match serde_json::from_str(data) {
                Ok(value) => value,
                Err(_) => continue,
            };

            let chunk_text = extract_text(&parsed);

            if chunk_text.is_empty() {
                continue;
            }

            let delta = if chunk_text.starts_with(&full_text) {
                let delta = chunk_text[full_text.len()..].to_string();
                full_text = chunk_text;
                delta
            } else {
                full_text.push_str(&chunk_text);
                chunk_text
            };

            if !delta.is_empty() {
                let _ = app.emit(
                    "gemini:stream",
                    serde_json::json!({"streamId": stream_id, "delta": delta}),
                );
            }
        }
    }

    let tail = buffer.trim();
    if !tail.is_empty() {
        let tail = tail.strip_prefix("data:").map(|value| value.trim()).unwrap_or(tail);
        if tail != "[DONE]" && tail != "[" && tail != "]" {
            if let Ok(parsed) = serde_json::from_str::<Value>(tail) {
                let chunk_text = extract_text(&parsed);
                if !chunk_text.is_empty() {
                    let delta = if chunk_text.starts_with(&full_text) {
                        let delta = chunk_text[full_text.len()..].to_string();
                        full_text = chunk_text;
                        delta
                    } else {
                        full_text.push_str(&chunk_text);
                        chunk_text
                    };
                    if !delta.is_empty() {
                        let _ = app.emit(
                            "gemini:stream",
                            serde_json::json!({"streamId": stream_id, "delta": delta}),
                        );
                    }
                }
            }
        }
    }

    let _ = app.emit(
        "gemini:stream",
        serde_json::json!({"streamId": stream_id, "done": true}),
    );

    Ok(full_text)
}
