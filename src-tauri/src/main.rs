#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod config;
mod constants;
mod hotkeys;
mod local_speech;
mod oauth;
mod resources;
mod tray;
mod types;

use std::sync::{Arc, Mutex};

use auth::AuthQueue;
use config::{should_auto_start_local_speech, ConfigState};
use hotkeys::{ActionHotkeyInput, HotkeyState};
use local_speech::FastWhisperManager;
use once_cell::sync::Lazy;
use serde_json::json;
use tauri::{Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_shell::ShellExt;
use types::{AppConfig, AuthDeepLinkPayload, AuthTokens, FastWhisperStatus};

static PENDING_DEEP_LINKS: Lazy<Mutex<Vec<String>>> = Lazy::new(|| Mutex::new(Vec::new()));

#[tauri::command]
async fn config_get(state: State<'_, Arc<ConfigState>>) -> Result<AppConfig, String> {
    Ok(state.get().await)
}

#[tauri::command]
async fn config_update(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    hotkeys: State<'_, Arc<HotkeyState>>,
    speech: State<'_, Arc<FastWhisperManager>>,
    payload: serde_json::Value,
) -> Result<AppConfig, String> {
    let updated = state
        .update(payload)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("config:updated", &updated)
        .map_err(|error| error.to_string())?;
    handle_config_effects(
        &app,
        &updated,
        hotkeys.inner().clone(),
        speech.inner().clone(),
    );
    Ok(updated)
}

#[tauri::command]
async fn config_set_auth(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    hotkeys: State<'_, Arc<HotkeyState>>,
    speech: State<'_, Arc<FastWhisperManager>>,
    tokens: AuthTokens,
) -> Result<AppConfig, String> {
    let updated = state
        .set_auth_tokens(tokens)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("config:updated", &updated)
        .map_err(|error| error.to_string())?;
    handle_config_effects(
        &app,
        &updated,
        hotkeys.inner().clone(),
        speech.inner().clone(),
    );
    Ok(updated)
}

#[tauri::command]
async fn config_reset(
    app: tauri::AppHandle,
    state: State<'_, Arc<ConfigState>>,
    hotkeys: State<'_, Arc<HotkeyState>>,
    speech: State<'_, Arc<FastWhisperManager>>,
) -> Result<AppConfig, String> {
    let updated = state
        .reset()
        .await
        .map_err(|error| error.to_string())?;
    app.emit("config:updated", &updated)
        .map_err(|error| error.to_string())?;
    handle_config_effects(
        &app,
        &updated,
        hotkeys.inner().clone(),
        speech.inner().clone(),
    );
    Ok(updated)
}

#[tauri::command]
async fn config_path(state: State<'_, Arc<ConfigState>>) -> Result<String, String> {
    Ok(state.path().await.to_string_lossy().to_string())
}

#[tauri::command]
async fn resources_sound_path(
    app: tauri::AppHandle,
    sound_name: String,
) -> Result<String, String> {
    resources::resolve_sound_path(&app, &sound_name)
        .ok_or_else(|| format!("Sound {sound_name} not found"))
}

#[tauri::command]
async fn auth_consume_pending(
    queue: State<'_, Arc<AuthQueue>>,
) -> Result<Vec<AuthDeepLinkPayload>, String> {
    Ok(queue.drain().await)
}

#[tauri::command]
async fn auth_start_oauth(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    let url = oauth::build_oauth_start_url(&provider).map_err(|error| error.to_string())?;
    app.shell()
        .open(url, None)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_speech_get_status(
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    Ok(manager.get_status().await)
}

#[tauri::command]
async fn local_speech_install(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    manager
        .install_and_start(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_speech_start(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    manager
        .start_existing(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_speech_restart(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    manager
        .restart(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_speech_reinstall(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    manager
        .reinstall(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn local_speech_stop(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    manager
        .stop(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn action_hotkeys_register(
    app: tauri::AppHandle,
    hotkeys_state: State<'_, Arc<HotkeyState>>,
    hotkeys: Vec<ActionHotkeyInput>,
) -> Result<(), String> {
    hotkeys_state.register_action_hotkeys(&app, hotkeys);
    Ok(())
}

#[tauri::command]
fn action_hotkeys_clear(
    app: tauri::AppHandle,
    hotkeys_state: State<'_, Arc<HotkeyState>>,
) -> Result<(), String> {
    hotkeys_state.clear_action_hotkeys(&app);
    Ok(())
}

#[tauri::command]
async fn window_open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(feature = "devtools")]
    {
        if let Some(window) = app.get_webview_window("main") {
            window.open_devtools();
            Ok(())
        } else {
            Err("Main window not found".to_string())
        }
    }
    #[cfg(not(feature = "devtools"))]
    {
        Err("DevTools feature is not enabled".to_string())
    }
}

#[tauri::command]
async fn window_open_main(app: tauri::AppHandle) -> Result<(), String> {
    // Пробуем получить существующее окно
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| format!("Failed to show main window: {}", e))?;
        main.set_focus().map_err(|e| format!("Failed to focus main window: {}", e))?;
        Ok(())
    } else {
        // Если окно не найдено, создаем его заново
        // В Tauri 2.x используем WebviewWindowBuilder с правильным URL
        use tauri::WebviewUrl;
        let url = WebviewUrl::App("index.html".into());
        let window = tauri::WebviewWindowBuilder::new(&app, "main", url)
            .title("Winky")
            .inner_size(960.0, 640.0)
            .min_inner_size(960.0, 640.0)
            .resizable(true)
            .decorations(false)
            .build()
            .map_err(|e| format!("Failed to create main window: {}", e))?;
        
        window.show().map_err(|e| format!("Failed to show main window: {}", e))?;
        window.set_focus().map_err(|e| format!("Failed to focus main window: {}", e))?;
        Ok(())
    }
}


fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(url) = args.into_iter().find(|arg| arg.starts_with("winky://")) {
                if let Some(state) = app.try_state::<Arc<AuthQueue>>() {
                    dispatch_deep_link(app, state.inner().clone(), url);
                } else {
                    PENDING_DEEP_LINKS.lock().unwrap().push(url);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let app_handle = app.handle();
            let config_state =
                Arc::new(tauri::async_runtime::block_on(ConfigState::initialize(&app_handle))?);
            let initial_config = tauri::async_runtime::block_on(config_state.get());

            let hotkeys = Arc::new(HotkeyState::new());
            let fast_whisper = Arc::new(FastWhisperManager::new());
            let auth_queue = Arc::new(AuthQueue::new());

            app.manage(config_state);
            app.manage(hotkeys.clone());
            app.manage(fast_whisper.clone());
            app.manage(auth_queue.clone());

            setup_deep_link_listener(&app_handle, auth_queue);
            tray::setup(&app_handle)?;
            handle_config_effects(&app_handle, &initial_config, hotkeys, fast_whisper);
            
            // Обрабатываем закрытие главного окна - скрываем его вместо закрытия приложения
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle_clone = app_handle.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Скрываем окно вместо закрытия, чтобы приложение продолжало работать в фоне
                        api.prevent_close();
                        let _ = app_handle_clone.get_webview_window("main").and_then(|w| {
                            w.hide().ok()
                        });
                    }
                });
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_get,
            config_update,
            config_set_auth,
            config_reset,
            config_path,
            resources_sound_path,
            auth_consume_pending,
            auth_start_oauth,
            local_speech_get_status,
            local_speech_install,
            local_speech_start,
            local_speech_restart,
            local_speech_reinstall,
            local_speech_stop,
            action_hotkeys_register,
            action_hotkeys_clear,
            window_open_devtools,
            window_open_main
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_deep_link_listener(app: &tauri::AppHandle, queue: Arc<AuthQueue>) {
    let mut pending = PENDING_DEEP_LINKS.lock().unwrap();
    for url in pending.drain(..) {
        dispatch_deep_link(app, queue.clone(), url);
    }

    if let Ok(Some(urls)) = app.deep_link().get_current() {
        for url in urls {
            dispatch_deep_link(app, queue.clone(), url.to_string());
        }
    }

    let queue_listener = queue.clone();
    let app_listener = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            dispatch_deep_link(&app_listener, queue_listener.clone(), url.to_string());
        }
    });
}

fn handle_config_effects(
    app: &tauri::AppHandle,
    config: &AppConfig,
    hotkeys: Arc<HotkeyState>,
    speech: Arc<FastWhisperManager>,
) {
    let accelerator = {
        let trimmed = config.mic_hotkey.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    };
    hotkeys.register_mic(app, accelerator);

    if should_auto_start_local_speech(config) {
        let manager = speech.clone();
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = manager.start_existing(&app_handle).await;
        });
    }

    if config.setup_completed && config.mic_show_on_launch {
        let _ = app.emit("mic:show-request", json!({ "reason": "auto" }));
    }
}

fn dispatch_deep_link(app: &tauri::AppHandle, queue: Arc<AuthQueue>, url: String) {
    tauri::async_runtime::spawn(auth::handle_deep_link(
        app.clone(),
        queue,
        url,
    ));
}
