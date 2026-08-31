use std::time::Duration;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::constants::{BACKEND_DOMAIN_RU, DEFAULT_BACKEND_DOMAIN, OAUTH_APP_NAME};
use crate::oauth_server;
use crate::oauth_server::OAuthAttempt;
use crate::types::AuthTokensPayload;

const SUPPORTED_OAUTH_PROVIDERS: &[&str] = &["google", "github", "discord", "yandex"];
const AUTH_METHODS_PATH: &str = "/api/v1/auth/methods/";
const DESKTOP_OAUTH_EXCHANGE_PATH: &str = "/api/v1/auth/oauth/desktop/exchange/";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuthMethods {
    pub country_code: String,
    pub country_known: bool,
    pub allowed_oauth_providers: Vec<String>,
    pub email_password_allowed: bool,
    #[serde(default)]
    pub allowed_email_domains: Vec<String>,
}

#[derive(Serialize)]
struct DesktopOAuthExchangeRequest<'a> {
    code: &'a str,
    code_verifier: &'a str,
    app: &'static str,
    provider: &'a str,
    state: &'a str,
}

fn normalize_base(input: Option<String>) -> Option<String> {
    let raw = input?.trim().to_string();
    if raw.is_empty() {
        return None;
    }
    let mut url = url::Url::parse(&raw).ok()?;
    let trimmed_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&trimmed_path);
    url.set_query(None);
    url.set_fragment(None);
    Some(url.to_string().trim_end_matches('/').to_string())
}

fn env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

fn resolve_site_base_by_domain(backend_domain: Option<&str>) -> String {
    let resolved_domain = if backend_domain == Some(BACKEND_DOMAIN_RU) {
        BACKEND_DOMAIN_RU
    } else {
        DEFAULT_BACKEND_DOMAIN
    };
    format!("https://{resolved_domain}")
}

fn resolve_api_base_by_domain(backend_domain: Option<&str>) -> String {
    let resolved_domain = if backend_domain == Some(BACKEND_DOMAIN_RU) {
        BACKEND_DOMAIN_RU
    } else {
        DEFAULT_BACKEND_DOMAIN
    };
    format!("https://{resolved_domain}/api/v1")
}

fn resolve_auth_api_base(backend_domain: Option<&str>) -> String {
    normalize_base(env("WINKY_AUTH_API_BASE_URL"))
        .or_else(|| normalize_base(env("WINKY_API_BASE_URL")))
        .or_else(|| normalize_base(env("API_BASE_URL")))
        .unwrap_or_else(|| resolve_api_base_by_domain(backend_domain))
}

fn auth_methods_url(backend_domain: Option<&str>) -> Result<String> {
    let mut url = url::Url::parse(&resolve_auth_api_base(backend_domain))?;
    url.set_path(AUTH_METHODS_PATH);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

pub fn is_supported_provider(provider: &str) -> bool {
    let normalized = provider.trim().to_lowercase();
    SUPPORTED_OAUTH_PROVIDERS.contains(&normalized.as_str())
}

pub async fn load_auth_methods(backend_domain: Option<&str>) -> Result<AuthMethods> {
    let url = auth_methods_url(backend_domain)?;
    log::info!(
        target: "auth",
        "Loading auth methods: url={} backend_domain={:?}",
        url,
        backend_domain
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let response = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await?;
    let status = response.status();
    log::info!(target: "auth", "Auth methods response status: {status}");
    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "Failed to load auth methods: HTTP {}",
            status.as_u16()
        ));
    }
    let mut methods = response.json::<AuthMethods>().await?;
    methods.allowed_oauth_providers = methods
        .allowed_oauth_providers
        .into_iter()
        .map(|provider| provider.trim().to_lowercase())
        .filter(|provider| is_supported_provider(provider))
        .collect();
    log::info!(
        target: "auth",
        "Auth methods loaded: country={} known={} providers={:?} email_allowed={} email_domains={}",
        methods.country_code,
        methods.country_known,
        methods.allowed_oauth_providers,
        methods.email_password_allowed,
        methods.allowed_email_domains.len()
    );
    Ok(methods)
}

pub fn provider_is_allowed(methods: &AuthMethods, provider: &str) -> bool {
    let normalized = provider.trim().to_lowercase();
    methods
        .allowed_oauth_providers
        .iter()
        .any(|allowed| allowed == &normalized)
}

/// Проверяет, запущено ли приложение с правами администратора
#[cfg(target_os = "windows")]
pub fn is_running_as_admin() -> bool {
    use std::mem;
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::processthreadsapi::{GetCurrentProcess, OpenProcessToken};
    use winapi::um::securitybaseapi::GetTokenInformation;
    use winapi::um::winnt::{TokenElevation, HANDLE, TOKEN_ELEVATION, TOKEN_QUERY};

    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }

        let mut elevation: TOKEN_ELEVATION = mem::zeroed();
        let mut size: u32 = 0;
        let result = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        );

        CloseHandle(token);

        result != 0 && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(target_os = "windows"))]
pub fn is_running_as_admin() -> bool {
    false
}

/// Строит URL браузерного OAuth и привязывает его к native PKCE-попытке.
pub fn build_oauth_start_url(
    provider: &str,
    backend_domain: Option<&str>,
    attempt: &OAuthAttempt,
) -> Result<String> {
    let provider_lower = provider.to_lowercase();
    let key = format!("OAUTH_PROVIDER_URL_{}", provider_lower.to_uppercase());
    let mut url = if let Some(override_url) = env(&key) {
        url::Url::parse(&override_url)?
    } else {
        let base = normalize_base(env("OAUTH_START_BASE_URL"))
            .or_else(|| normalize_base(env("OAUTH_SITE_URL")))
            .or_else(|| normalize_base(env("OAUTH_BASE_URL")))
            .or_else(|| normalize_base(env("APP_BASE_URL")))
            .unwrap_or_else(|| resolve_site_base_by_domain(backend_domain));
        let mut url = url::Url::parse(&base)?;
        url.set_path(&format!("/auth/oauth/{provider_lower}/start"));
        url
    };

    url.set_query(None);
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("app_auth", OAUTH_APP_NAME);
        query.append_pair("state", &attempt.state);
        query.append_pair("desktop_code_challenge", &attempt.code_challenge);
        query.append_pair("desktop_code_challenge_method", "S256");
        if is_running_as_admin() {
            query.append_pair("redirect_uri", &oauth_server::get_callback_url());
        }
    }
    if is_running_as_admin() {
        log::info!(target: "auth", "Using loopback OAuth callback");
    }
    Ok(url.to_string())
}

pub async fn exchange_desktop_code(
    attempt: &OAuthAttempt,
    code: &str,
) -> Result<AuthTokensPayload> {
    let mut url = url::Url::parse(&resolve_auth_api_base(Some(&attempt.backend_domain)))?;
    url.set_path(DESKTOP_OAUTH_EXCHANGE_PATH);
    url.set_query(None);
    url.set_fragment(None);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let response = client
        .post(url)
        .json(&DesktopOAuthExchangeRequest {
            code,
            code_verifier: &attempt.code_verifier,
            app: OAUTH_APP_NAME,
            provider: &attempt.provider,
            state: &attempt.state,
        })
        .send()
        .await?;
    let status = response.status();
    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "Desktop OAuth exchange failed with HTTP {}",
            status.as_u16()
        ));
    }
    Ok(response.json::<AuthTokensPayload>().await?)
}
