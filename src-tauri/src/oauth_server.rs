//! Локальный HTTP сервер для OAuth callback.
//! Используется как fallback когда deep link не работает (например, при запуске от администратора).

use std::net::TcpListener;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener as AsyncTcpListener;
use tauri::{AppHandle, Emitter};

use crate::auth::AuthQueue;
use crate::types::{AuthDeepLinkPayload, AuthTokensPayload};

/// Порт для локального OAuth сервера
const OAUTH_SERVER_PORT: u16 = 17842;

/// HTML страница успешной авторизации
const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Winky - Авторизация</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            max-width: 400px;
        }
        .success-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            animation: bounce 0.6s ease-out;
        }
        .success-icon::after {
            content: '✓';
            font-size: 40px;
            color: white;
        }
        h1 { font-size: 24px; margin-bottom: 12px; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        @keyframes bounce {
            0% { transform: scale(0); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon"></div>
        <h1>Авторизация успешна!</h1>
        <p>Вы можете закрыть это окно и вернуться в приложение Winky.</p>
    </div>
    <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>"#;

/// HTML страница ошибки авторизации
const ERROR_HTML: &str = r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Winky - Ошибка</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            max-width: 400px;
        }
        .error-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .error-icon::after {
            content: '✕';
            font-size: 40px;
            color: white;
        }
        h1 { font-size: 24px; margin-bottom: 12px; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        .error-msg { color: #fca5a5; margin-top: 12px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon"></div>
        <h1>Ошибка авторизации</h1>
        <p>Произошла ошибка при авторизации. Попробуйте еще раз.</p>
        <p class="error-msg">{{ERROR}}</p>
    </div>
</body>
</html>"#;

/// Состояние OAuth сервера
pub struct OAuthServerState {
    running: Mutex<bool>,
    listener_ready: Arc<tokio::sync::Notify>,
}

impl OAuthServerState {
    pub fn new() -> Self {
        Self {
            running: Mutex::new(false),
            listener_ready: Arc::new(tokio::sync::Notify::new()),
        }
    }
    
    pub async fn wait_until_ready(&self) {
        self.listener_ready.notified().await;
    }
    
    pub fn mark_ready(&self) {
        self.listener_ready.notify_one();
    }
}

/// Проверяет доступен ли порт для OAuth сервера
#[allow(dead_code)]
pub fn is_port_available() -> bool {
    TcpListener::bind(format!("127.0.0.1:{}", OAUTH_SERVER_PORT)).is_ok()
}

/// Возвращает URL для OAuth callback через локальный сервер
pub fn get_callback_url() -> String {
    format!("http://127.0.0.1:{}/oauth/callback", OAUTH_SERVER_PORT)
}

/// Запускает локальный HTTP сервер для OAuth callback
pub async fn start_oauth_server(
    app: AppHandle,
    queue: Arc<AuthQueue>,
    state: Arc<OAuthServerState>,
) -> anyhow::Result<()> {
    let mut running = state.running.lock().await;
    if *running {
        crate::logging::log_message("[OAuthServer] Server already running");
        return Ok(());
    }
    *running = true;
    drop(running);

    crate::logging::log_message(&format!("[OAuthServer] Starting server on port {}...", OAUTH_SERVER_PORT));
    let listener = AsyncTcpListener::bind(format!("127.0.0.1:{}", OAUTH_SERVER_PORT)).await?;
    crate::logging::log_message(&format!("[OAuthServer] Server listening on port {}", OAUTH_SERVER_PORT));
    
    // Отмечаем что сервер готов
    state.mark_ready();

    let state_clone = state.clone();
    let app_clone = app.clone();
    let queue_clone = queue.clone();
    
    tokio::spawn(async move {
        crate::logging::log_message("[OAuthServer] Server task started");
        loop {
            // Проверяем флаг перед accept
            {
                let running = state_clone.running.lock().await;
                if !*running {
                    crate::logging::log_message("[OAuthServer] Server stopped, exiting loop");
                    break;
                }
            }

            match listener.accept().await {
                Ok((mut stream, addr)) => {
                    crate::logging::log_message(&format!("[OAuthServer] New connection from {}", addr));
                    let app = app_clone.clone();
                    let queue = queue_clone.clone();
                    
                    tokio::spawn(async move {
                        let mut buffer = [0u8; 4096];
                        match stream.read(&mut buffer).await {
                            Ok(n) => {
                                let request = String::from_utf8_lossy(&buffer[..n]);
                                crate::logging::log_message(&format!("[OAuthServer] Received request ({} bytes)", n));
                                for line in request.lines().take(5) {
                                    crate::logging::log_message(&format!("[OAuthServer]   {}", line));
                                }
                                
                                // Парсим HTTP запрос
                                if let Some(path) = parse_request_path(&request) {
                                    crate::logging::log_message(&format!("[OAuthServer] Parsed path: {}", path));
                                    if path.starts_with("/oauth/callback") {
                                        crate::logging::log_message("[OAuthServer] Processing OAuth callback");
                                        let (html, payload) = handle_oauth_callback(&path);
                                        
                                        // Отправляем payload в приложение
                                        if let Some(payload) = payload.clone() {
                                            crate::logging::log_message(&format!("[OAuthServer] Enqueueing payload: {:?}", payload));
                                            queue.enqueue(payload.clone()).await;
                                            match app.emit("auth:deep-link", payload) {
                                                Ok(_) => crate::logging::log_message("[OAuthServer] Event emitted successfully"),
                                                Err(e) => crate::logging::log_message(&format!("[OAuthServer] Failed to emit event: {}", e)),
                                            }
                                        } else {
                                            crate::logging::log_message("[OAuthServer] No payload extracted from callback");
                                        }
                                        
                                        // Отправляем HTTP ответ
                                        let response = format!(
                                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                            html.len(),
                                            html
                                        );
                                        if let Err(e) = stream.write_all(response.as_bytes()).await {
                                            crate::logging::log_message(&format!("[OAuthServer] Failed to write response: {}", e));
                                        } else {
                                            crate::logging::log_message("[OAuthServer] Response sent successfully");
                                        }
                                    } else {
                                        crate::logging::log_message("[OAuthServer] Path not /oauth/callback, returning 404");
                                        // 404 для других путей
                                        let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                                        let _ = stream.write_all(response.as_bytes()).await;
                                    }
                                } else {
                                    crate::logging::log_message("[OAuthServer] Failed to parse request path");
                                }
                            }
                            Err(e) => {
                                crate::logging::log_message(&format!("[OAuthServer] Failed to read from stream: {}", e));
                            }
                        }
                    });
                }
                Err(e) => {
                    crate::logging::log_message(&format!("[OAuthServer] Accept error: {}", e));
                    // Не выходим из цикла при ошибке accept, продолжаем слушать
                }
            }
        }
        crate::logging::log_message("[OAuthServer] Server task ended");
    });

    Ok(())
}

/// Останавливает OAuth сервер
#[allow(dead_code)]
pub async fn stop_oauth_server(state: Arc<OAuthServerState>) {
    let mut running = state.running.lock().await;
    *running = false;
}

/// Парсит путь из HTTP запроса
fn parse_request_path(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() >= 2 && parts[0] == "GET" {
        Some(parts[1].to_string())
    } else {
        None
    }
}

/// Обрабатывает OAuth callback и возвращает HTML и payload
fn handle_oauth_callback(path: &str) -> (String, Option<AuthDeepLinkPayload>) {
    crate::logging::log_message(&format!("[OAuthServer] Handling callback, path: {}", path));
    
    // Парсим query параметры
    let query_start = path.find('?').map(|i| i + 1).unwrap_or(path.len());
    let query = &path[query_start..];
    crate::logging::log_message(&format!("[OAuthServer] Query string: {}", query));
    
    let mut payload_str: Option<String> = None;
    
    // Пробуем найти payload в разных форматах
    for param in query.split('&') {
        let mut parts = param.splitn(2, '=');
        if let (Some(key), Some(value)) = (parts.next(), parts.next()) {
            crate::logging::log_message(&format!("[OAuthServer] Query param: {} = {}", key, value));
            if key == "payload" {
                match urlencoding::decode(value) {
                    Ok(decoded) => {
                        payload_str = Some(decoded.into_owned());
                        crate::logging::log_message("[OAuthServer] Found payload parameter");
                    }
                    Err(e) => {
                        crate::logging::log_message(&format!("[OAuthServer] Failed to decode payload: {}", e));
                    }
                }
            }
        }
    }
    
    if let Some(payload_json) = payload_str {
        crate::logging::log_message(&format!("[OAuthServer] Payload JSON: {}", payload_json));
        match parse_payload(&payload_json) {
            Ok(payload) => {
                crate::logging::log_message("[OAuthServer] Payload parsed successfully");
                let html = SUCCESS_HTML.to_string();
                (html, Some(payload))
            }
            Err(e) => {
                crate::logging::log_message(&format!("[OAuthServer] Failed to parse payload: {}", e));
                let html = ERROR_HTML.replace("{{ERROR}}", &e);
                (html, None)
            }
        }
    } else {
        crate::logging::log_message("[OAuthServer] No payload parameter found in query string");
        // Пробуем распарсить весь path как URL и извлечь данные оттуда
        if let Ok(url) = url::Url::parse(&format!("http://127.0.0.1{}", path)) {
            crate::logging::log_message("[OAuthServer] Trying to parse as URL");
            for (key, value) in url.query_pairs() {
                crate::logging::log_message(&format!("[OAuthServer] URL param: {} = {}", key, value));
                if key == "payload" {
                    payload_str = Some(value.into_owned());
                    break;
                }
            }
            
            if let Some(payload_json) = payload_str {
                match parse_payload(&payload_json) {
                    Ok(payload) => {
                        crate::logging::log_message("[OAuthServer] Payload parsed from URL successfully");
                        let html = SUCCESS_HTML.to_string();
                        return (html, Some(payload));
                    }
                    Err(e) => {
                        crate::logging::log_message(&format!("[OAuthServer] Failed to parse payload from URL: {}", e));
                    }
                }
            }
        }
        
        let html = ERROR_HTML.replace("{{ERROR}}", "Missing payload parameter");
        (html, None)
    }
}

/// Парсит JSON payload из OAuth callback
fn parse_payload(json_str: &str) -> Result<AuthDeepLinkPayload, String> {
    let data: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    let provider = data
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    
    let app_name = data.get("app").and_then(|v| v.as_str()).unwrap_or("");
    if app_name != "winky" {
        return Ok(AuthDeepLinkPayload::Error {
            provider,
            error: "Invalid OAuth payload: wrong app".into(),
        });
    }
    
    if let Some(error) = data.get("error").and_then(|v| v.as_str()) {
        if !error.trim().is_empty() {
            return Ok(AuthDeepLinkPayload::Error {
                provider,
                error: error.to_string(),
            });
        }
    }
    
    let tokens = data.get("tokens")
        .and_then(|v| v.as_object())
        .ok_or("Missing tokens")?;
    
    let access = tokens
        .get("access")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or("Missing access token")?;
    
    let refresh = tokens
        .get("refresh")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    
    Ok(AuthDeepLinkPayload::Success {
        provider,
        tokens: AuthTokensPayload { access, refresh },
        user: data.get("user").cloned(),
    })
}

