use anyhow::Result;

use crate::constants::SITE_BASE_URL;
use crate::oauth_server;

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
    std::env::var(key).ok().filter(|value| !value.trim().is_empty())
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

/// Строит URL для OAuth с учётом режима работы.
/// При запуске от администратора использует HTTP callback вместо deep link.
pub fn build_oauth_start_url(provider: &str) -> Result<String> {
    let provider_lower = provider.to_lowercase();
    let key = format!("OAUTH_PROVIDER_URL_{}", provider_lower.to_uppercase());
    if let Some(override_url) = env(&key) {
        return Ok(override_url);
    }
    
    let base = normalize_base(env("OAUTH_START_BASE_URL"))
        .or_else(|| normalize_base(env("OAUTH_SITE_URL")))
        .or_else(|| normalize_base(env("OAUTH_BASE_URL")))
        .or_else(|| normalize_base(env("APP_BASE_URL")))
        .unwrap_or_else(|| SITE_BASE_URL.to_string());
    
    let mut url = url::Url::parse(&base)?;
    url.set_path(&format!("/auth/oauth/{}/start", provider_lower));
    
    // Если запущено от администратора, используем HTTP callback
    // потому что deep link не работает из-за UIPI
    if is_running_as_admin() {
        let callback_url = oauth_server::get_callback_url();
        let encoded_callback = urlencoding::encode(&callback_url);
        url.set_query(Some(&format!("app_auth=winky&redirect_uri={}", encoded_callback)));
        crate::logging::log_message(&format!("[OAuth] Running as admin, using HTTP callback: {}", callback_url));
    } else {
        url.set_query(Some("app_auth=winky"));
    }
    
    Ok(url.to_string())
}
