use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

use crate::oauth_server::OAuthServerState;
use crate::types::AuthDeepLinkPayload;

pub const AUTH_OWNER_WINDOW_LABEL: &str = "main";

#[derive(Default)]
pub struct AuthQueue {
    pending: Mutex<Vec<AuthDeepLinkPayload>>,
}

impl AuthQueue {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(Vec::new()),
        }
    }

    pub async fn enqueue(&self, payload: AuthDeepLinkPayload) {
        self.pending.lock().await.push(payload);
    }

    pub async fn drain(&self) -> Vec<AuthDeepLinkPayload> {
        let mut guard = self.pending.lock().await;
        let drained = guard.clone();
        guard.clear();
        drained
    }
}

pub async fn handle_deep_link(app: AppHandle, queue: Arc<AuthQueue>, url: String) {
    if let Some(payload) = parse_auth_payload(&url) {
        let Some(oauth_state) = app
            .try_state::<Arc<OAuthServerState>>()
            .map(|state| state.inner().clone())
        else {
            crate::logging::log_message("[Auth] OAuth state is unavailable; callback rejected");
            return;
        };
        if !oauth_state.accept_callback(&payload).await {
            crate::logging::log_message(
                "[Auth] Rejected callback without a matching OAuth attempt",
            );
            return;
        }
        queue.enqueue(payload.clone()).await;
        let _ = app.emit_to(AUTH_OWNER_WINDOW_LABEL, "auth:deep-link", payload);
    }
}

fn parse_auth_payload(url: &str) -> Option<AuthDeepLinkPayload> {
    let parsed = url::Url::parse(url).ok()?;
    if parsed.scheme() != "winky" {
        return None;
    }
    if parsed.host_str() != Some("auth") {
        return None;
    }
    if parsed.path() != "/callback" {
        return None;
    }
    let payload = parsed
        .query_pairs()
        .find(|(key, _)| key == "payload")
        .map(|(_, value)| value.into_owned())?;
    let data: serde_json::Value = serde_json::from_str(&payload).ok()?;
    let app_name = data
        .get("app")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if app_name != "winky" {
        return None;
    }
    let provider = data
        .get("provider")
        .and_then(|value| value.as_str())?
        .trim()
        .to_lowercase();
    if !crate::oauth::is_supported_provider(&provider) {
        return None;
    }
    let state = data.get("state").and_then(|value| value.as_str())?;
    if !is_opaque_value(state, 16, 256) {
        return None;
    }
    if let Some(error) = data.get("error").and_then(|value| value.as_str()) {
        let error = error.trim();
        if !error.is_empty() {
            return Some(AuthDeepLinkPayload::Error {
                provider,
                error: error.to_string(),
                state: state.to_string(),
            });
        }
        return None;
    }
    let code = data.get("code").and_then(|value| value.as_str());
    if code.is_none_or(|value| !is_opaque_value(value, 32, 128)) {
        return Some(AuthDeepLinkPayload::Error {
            provider,
            error: "Invalid OAuth code response".into(),
            state: state.to_string(),
        });
    }
    Some(AuthDeepLinkPayload::Code {
        provider,
        code: code?.to_string(),
        state: state.to_string(),
    })
}

fn is_opaque_value(value: &str, minimum: usize, maximum: usize) -> bool {
    (minimum..=maximum).contains(&value.len())
        && value
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'))
}

#[cfg(test)]
mod tests {
    use super::parse_auth_payload;
    use crate::types::AuthDeepLinkPayload;

    #[test]
    fn error_callback_requires_provider_and_state() {
        let state = "s".repeat(43);
        let payload = serde_json::json!({
            "app": "winky",
            "provider": "google",
            "error": "access_denied",
            "state": state,
        });
        let mut url = url::Url::parse("winky://auth/callback").unwrap();
        url.query_pairs_mut()
            .append_pair("payload", &payload.to_string());

        assert!(matches!(
            parse_auth_payload(url.as_str()),
            Some(AuthDeepLinkPayload::Error {
                provider,
                error,
                state: callback_state,
            }) if provider == "google"
                && error == "access_denied"
                && callback_state == state
        ));

        let missing_state = serde_json::json!({
            "app": "winky",
            "provider": "google",
            "error": "access_denied",
        });
        url.query_pairs_mut()
            .clear()
            .append_pair("payload", &missing_state.to_string());
        assert!(parse_auth_payload(url.as_str()).is_none());
    }

    #[test]
    fn callback_rejects_unknown_provider_and_wrong_path() {
        let payload = serde_json::json!({
            "app": "winky",
            "provider": "unknown",
            "error": "access_denied",
            "state": "s".repeat(43),
        });
        let mut url = url::Url::parse("winky://auth/callback").unwrap();
        url.query_pairs_mut()
            .append_pair("payload", &payload.to_string());
        assert!(parse_auth_payload(url.as_str()).is_none());

        url.set_path("/callback/other");
        assert!(parse_auth_payload(url.as_str()).is_none());
    }
}
