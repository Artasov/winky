//! Локальный callback-сервер и временное состояние OAuth PKCE.

use std::collections::HashMap;
use std::net::TcpListener;
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener as AsyncTcpListener;
use tokio::sync::{Mutex, MutexGuard};

use crate::auth::{AuthQueue, AUTH_OWNER_WINDOW_LABEL};
use crate::types::AuthDeepLinkPayload;

const OAUTH_SERVER_PORT: u16 = 17842;
const OAUTH_ATTEMPT_TTL: Duration = Duration::from_secs(5 * 60);

const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>Winky — авторизация</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #132238; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { max-width: 420px; padding: 40px; border: 1px solid #ffffff22; border-radius: 20px; text-align: center; background: #ffffff0d; }
        h1 { margin-bottom: 12px; font-size: 24px; }
        p { color: #a9b7ca; line-height: 1.6; }
    </style>
</head>
<body><main class="card"><h1>Авторизация завершена</h1><p>Вернитесь в Winky. Это окно можно закрыть.</p></main></body>
</html>"#;

const ERROR_HTML: &str = r#"<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>Winky — ошибка авторизации</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #132238; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { max-width: 420px; padding: 40px; border: 1px solid #ef444455; border-radius: 20px; text-align: center; background: #ffffff0d; }
        h1 { margin-bottom: 12px; font-size: 24px; }
        p { color: #f3b5b5; line-height: 1.6; }
    </style>
</head>
<body><main class="card"><h1>Не удалось войти</h1><p>Вернитесь в Winky и повторите авторизацию.</p></main></body>
</html>"#;

#[derive(Clone, PartialEq)]
pub struct OAuthAttempt {
    pub provider: String,
    pub state: String,
    pub code_verifier: String,
    pub code_challenge: String,
    pub backend_domain: String,
    created_at: Instant,
    callback_received: bool,
}

pub struct OAuthServerState {
    running: Mutex<bool>,
    flow_lock: Mutex<()>,
    attempts: Mutex<HashMap<String, OAuthAttempt>>,
}

impl OAuthServerState {
    pub fn new() -> Self {
        Self {
            running: Mutex::new(false),
            flow_lock: Mutex::new(()),
            attempts: Mutex::new(HashMap::new()),
        }
    }

    pub async fn create_attempt(&self, provider: &str, backend_domain: &str) -> OAuthAttempt {
        let _flow_guard = self.flow_lock.lock().await;
        let state = random_url_value(32);
        let code_verifier = random_url_value(64);
        let code_challenge = pkce_challenge(&code_verifier);
        let attempt = OAuthAttempt {
            provider: provider.to_string(),
            state: state.clone(),
            code_verifier,
            code_challenge,
            backend_domain: backend_domain.to_string(),
            created_at: Instant::now(),
            callback_received: false,
        };
        let mut attempts = self.attempts.lock().await;
        attempts.clear();
        attempts.insert(state, attempt.clone());
        attempt
    }

    pub async fn lock_flow(&self) -> MutexGuard<'_, ()> {
        self.flow_lock.lock().await
    }

    pub async fn get_attempt(&self, state: &str) -> Option<OAuthAttempt> {
        let mut attempts = self.attempts.lock().await;
        attempts.retain(|_, stored| stored.created_at.elapsed() < OAUTH_ATTEMPT_TTL);
        attempts
            .get(state)
            .filter(|attempt| attempt.callback_received)
            .cloned()
    }

    pub async fn accept_callback(&self, payload: &AuthDeepLinkPayload) -> bool {
        let (provider, state, is_error) = match payload {
            AuthDeepLinkPayload::Code {
                provider, state, ..
            } => (provider, state, false),
            AuthDeepLinkPayload::Error {
                provider, state, ..
            } => (provider, state, true),
        };
        let normalized_provider = provider.trim().to_lowercase();
        if !crate::oauth::is_supported_provider(&normalized_provider)
            || !is_opaque_value(state, 16, 256)
        {
            return false;
        }

        let mut attempts = self.attempts.lock().await;
        attempts.retain(|_, stored| stored.created_at.elapsed() < OAUTH_ATTEMPT_TTL);
        let matches_attempt = attempts.get(state).is_some_and(|attempt| {
            !attempt.callback_received && attempt.provider == normalized_provider
        });
        if !matches_attempt {
            return false;
        }

        if is_error {
            attempts.remove(state);
        } else if let Some(attempt) = attempts.get_mut(state) {
            attempt.callback_received = true;
        }
        true
    }

    pub async fn remove_attempt(&self, state: &str) {
        self.attempts.lock().await.remove(state);
    }
}

fn random_url_value(byte_count: usize) -> String {
    let mut bytes = vec![0_u8; byte_count];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[allow(dead_code)]
pub fn is_port_available() -> bool {
    TcpListener::bind(format!("127.0.0.1:{OAUTH_SERVER_PORT}")).is_ok()
}

pub fn get_callback_url() -> String {
    format!("http://127.0.0.1:{OAUTH_SERVER_PORT}/oauth/callback")
}

pub async fn start_oauth_server(
    app: AppHandle,
    queue: Arc<AuthQueue>,
    state: Arc<OAuthServerState>,
) -> anyhow::Result<()> {
    let mut running = state.running.lock().await;
    if *running {
        return Ok(());
    }

    let listener = AsyncTcpListener::bind(format!("127.0.0.1:{OAUTH_SERVER_PORT}")).await?;
    *running = true;
    drop(running);
    crate::logging::log_message("[OAuthServer] Callback listener is ready");

    tokio::spawn(async move {
        loop {
            if !*state.running.lock().await {
                break;
            }
            let (mut stream, _) = match listener.accept().await {
                Ok(connection) => connection,
                Err(error) => {
                    crate::logging::log_message(&format!("[OAuthServer] Accept failed: {error}"));
                    continue;
                }
            };
            let app = app.clone();
            let queue = queue.clone();
            let state = state.clone();
            tokio::spawn(async move {
                let mut buffer = [0_u8; 4096];
                let bytes_read = match stream.read(&mut buffer).await {
                    Ok(bytes_read) => bytes_read,
                    Err(error) => {
                        crate::logging::log_message(&format!(
                            "[OAuthServer] Request read failed: {error}"
                        ));
                        return;
                    }
                };
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                let parsed_payload =
                    parse_request_path(&request).and_then(|path| parse_callback(&path).ok());
                let payload = match parsed_payload {
                    Some(payload) if state.accept_callback(&payload).await => Some(payload),
                    Some(_) => {
                        crate::logging::log_message(
                            "[OAuthServer] Rejected callback without a matching OAuth attempt",
                        );
                        None
                    }
                    None => None,
                };
                let html = if matches!(&payload, Some(AuthDeepLinkPayload::Code { .. })) {
                    SUCCESS_HTML
                } else {
                    ERROR_HTML
                };

                if let Some(payload) = payload {
                    queue.enqueue(payload.clone()).await;
                    if let Err(error) =
                        app.emit_to(AUTH_OWNER_WINDOW_LABEL, "auth:deep-link", payload)
                    {
                        crate::logging::log_message(&format!(
                            "[OAuthServer] Event delivery failed: {error}"
                        ));
                    }
                }

                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{}",
                    html.len(),
                    html
                );
                if let Err(error) = stream.write_all(response.as_bytes()).await {
                    crate::logging::log_message(&format!(
                        "[OAuthServer] Response write failed: {error}"
                    ));
                }
            });
        }
    });
    Ok(())
}

#[allow(dead_code)]
pub async fn stop_oauth_server(state: Arc<OAuthServerState>) {
    *state.running.lock().await = false;
}

fn parse_request_path(request: &str) -> Option<String> {
    let mut parts = request.lines().next()?.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    parts.next().map(str::to_string)
}

fn parse_callback(path: &str) -> Result<AuthDeepLinkPayload, String> {
    let url = url::Url::parse(&format!("http://127.0.0.1{path}"))
        .map_err(|error| format!("Invalid callback URL: {error}"))?;
    if url.path() != "/oauth/callback" {
        return Err("Invalid callback path".to_string());
    }
    let payload = url
        .query_pairs()
        .find(|(key, _)| key == "payload")
        .map(|(_, value)| value.into_owned())
        .ok_or_else(|| "Missing callback payload".to_string())?;
    parse_payload(&payload)
}

fn parse_payload(json: &str) -> Result<AuthDeepLinkPayload, String> {
    let data: serde_json::Value =
        serde_json::from_str(json).map_err(|error| format!("Invalid callback JSON: {error}"))?;
    if data.get("app").and_then(serde_json::Value::as_str) != Some("winky") {
        return Err("OAuth callback belongs to another application".to_string());
    }
    let provider = read_provider(&data)?;
    let state = read_opaque_value(&data, "state", 16, 256)?;
    if let Some(error) = data.get("error").and_then(serde_json::Value::as_str) {
        let error = error.trim();
        if error.is_empty() {
            return Err("Empty OAuth error".to_string());
        }
        return Ok(AuthDeepLinkPayload::Error {
            provider,
            error: error.to_string(),
            state,
        });
    }
    let code = read_opaque_value(&data, "code", 32, 128)?;
    Ok(AuthDeepLinkPayload::Code {
        provider,
        code,
        state,
    })
}

fn read_provider(data: &serde_json::Value) -> Result<String, String> {
    let provider = data
        .get("provider")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Missing OAuth provider".to_string())?
        .trim()
        .to_lowercase();
    if !crate::oauth::is_supported_provider(&provider) {
        return Err("Invalid OAuth provider".to_string());
    }
    Ok(provider)
}

fn is_opaque_value(value: &str, minimum: usize, maximum: usize) -> bool {
    (minimum..=maximum).contains(&value.len())
        && value
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'))
}

fn read_opaque_value(
    data: &serde_json::Value,
    field: &str,
    minimum: usize,
    maximum: usize,
) -> Result<String, String> {
    let value = data
        .get(field)
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| format!("Missing OAuth {field}"))?;
    if !is_opaque_value(value, minimum, maximum) {
        return Err(format!("Invalid OAuth {field}"));
    }
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::{parse_payload, OAuthServerState};
    use crate::types::AuthDeepLinkPayload;

    #[test]
    fn callback_accepts_only_code_and_state() {
        let payload = format!(
            r#"{{"app":"winky","provider":"google","code":"{}","state":"{}"}}"#,
            "c".repeat(43),
            "s".repeat(43)
        );
        assert!(matches!(
            parse_payload(&payload),
            Ok(AuthDeepLinkPayload::Code { .. })
        ));
    }

    #[test]
    fn callback_rejects_legacy_tokens() {
        let payload = r#"{"app":"winky","provider":"google","tokens":{"access":"secret"}}"#;
        assert!(parse_payload(payload).is_err());
    }

    #[test]
    fn error_callback_requires_valid_provider_and_state() {
        let state = "s".repeat(43);
        let payload = format!(
            r#"{{"app":"winky","provider":"google","error":"access_denied","state":"{state}"}}"#
        );
        assert!(matches!(
            parse_payload(&payload),
            Ok(AuthDeepLinkPayload::Error {
                provider,
                error,
                state: callback_state,
            }) if provider == "google"
                && error == "access_denied"
                && callback_state == state
        ));

        let missing_state = r#"{"app":"winky","provider":"google","error":"access_denied"}"#;
        let unknown_provider = format!(
            r#"{{"app":"winky","provider":"unknown","error":"access_denied","state":"{state}"}}"#
        );
        assert!(parse_payload(missing_state).is_err());
        assert!(parse_payload(&unknown_provider).is_err());
    }

    #[tokio::test]
    async fn callback_is_accepted_once_for_the_matching_attempt() {
        let oauth_state = OAuthServerState::new();
        let attempt = oauth_state.create_attempt("google", "xlartas.com").await;
        let payload = AuthDeepLinkPayload::Code {
            provider: "google".to_string(),
            code: "c".repeat(43),
            state: attempt.state.clone(),
        };

        assert!(oauth_state.get_attempt(&attempt.state).await.is_none());
        assert!(oauth_state.accept_callback(&payload).await);
        assert!(oauth_state.get_attempt(&attempt.state).await.is_some());
        assert!(!oauth_state.accept_callback(&payload).await);
    }

    #[tokio::test]
    async fn new_attempt_rejects_callbacks_for_superseded_attempt() {
        let oauth_state = OAuthServerState::new();
        let superseded = oauth_state.create_attempt("google", "xlartas.com").await;
        let active = oauth_state.create_attempt("github", "xlartas.com").await;
        let old_error = AuthDeepLinkPayload::Error {
            provider: "google".to_string(),
            error: "access_denied".to_string(),
            state: superseded.state,
        };
        let active_error = AuthDeepLinkPayload::Error {
            provider: "github".to_string(),
            error: "access_denied".to_string(),
            state: active.state.clone(),
        };
        let wrong_provider = AuthDeepLinkPayload::Error {
            provider: "google".to_string(),
            error: "access_denied".to_string(),
            state: active.state.clone(),
        };

        assert!(!oauth_state.accept_callback(&old_error).await);
        assert!(!oauth_state.accept_callback(&wrong_provider).await);
        assert!(oauth_state.accept_callback(&active_error).await);
        assert!(!oauth_state.accept_callback(&active_error).await);
        assert!(oauth_state.get_attempt(&active.state).await.is_none());
    }
}
