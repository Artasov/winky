#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod auth;
mod config;
mod constants;
mod deep_link_file;
mod hotkeys;
mod history;
mod gemini;
mod notes;
mod local_speech;
mod logging;
mod oauth;
mod oauth_server;
mod ollama;
mod openai;
mod resources;
mod tray;
mod types;

use std::sync::{Arc, Mutex};

use auth::AuthQueue;
use serde::Deserialize;
use config::{should_auto_start_local_speech, ConfigState};
use hotkeys::{ActionHotkeyInput, HotkeyState};
use history::{
    append_history,
    clear_history,
    read_history,
    read_history_audio,
    save_history_audio,
    ActionHistoryEntry,
    ActionHistoryInput,
};
use notes::{
    bulk_delete_notes,
    create_note,
    delete_note,
    list_notes,
    update_note,
    NoteBulkDeleteInput,
    NoteBulkDeleteResponse,
    NoteCreateInput,
    NoteDeleteInput,
    NoteEntry,
    NoteListResponse,
    NoteUpdateInput,
};
use local_speech::{persist_install_dir_choice, FastWhisperManager};
use oauth_server::OAuthServerState;
use once_cell::sync::Lazy;
use serde_json::json;
use tauri::{Emitter, Manager, State};
use tauri::window::Color;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_autostart::ManagerExt;
use types::{AppConfig, AuthDeepLinkPayload, AuthTokens, FastWhisperStatus};

static PENDING_DEEP_LINKS: Lazy<Mutex<Vec<String>>> = Lazy::new(|| Mutex::new(Vec::new()));

#[derive(Deserialize)]
struct InstallArgs {
    #[serde(alias = "targetDir", alias = "target_dir")]
    target_dir: Option<String>,
}

#[derive(Deserialize)]
struct NotesListArgs {
    page: Option<u32>,
    #[serde(alias = "pageSize", alias = "page_size")]
    page_size: Option<u32>,
}

#[derive(Deserialize)]
struct HistoryAudioInput {
    audio: Vec<u8>,
    #[serde(alias = "mimeType", alias = "mime_type")]
    mime_type: Option<String>,
}

#[derive(Deserialize)]
struct HistoryReadAudioInput {
    #[serde(alias = "audioPath", alias = "audio_path")]
    audio_path: String,
}

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
    // Проверяем, изменяется ли настройка автозапуска
    let autostart_changed = payload
        .get("launchOnSystemStartup")
        .and_then(|v| v.as_bool())
        .is_some();
    
    let updated = state
        .update(payload)
        .await
        .map_err(|error| error.to_string())?;
    
    // Обновляем автозапуск системы, если настройка изменилась
    if autostart_changed {
        update_autostart(&app, updated.launch_on_system_startup)
            .map_err(|error| format!("Failed to update autostart: {}", error))?;
    }
    
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
async fn history_get(app: tauri::AppHandle) -> Result<Vec<ActionHistoryEntry>, String> {
    read_history(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn history_add(
    app: tauri::AppHandle,
    payload: ActionHistoryInput,
) -> Result<ActionHistoryEntry, String> {
    let entry = append_history(&app, payload)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("history:updated", json!({"type": "added", "entry": &entry}))
        .map_err(|error| error.to_string())?;
    Ok(entry)
}

#[tauri::command]
async fn history_clear(app: tauri::AppHandle) -> Result<(), String> {
    clear_history(&app)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("history:updated", json!({"type": "cleared"}))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn history_save_audio(
    app: tauri::AppHandle,
    payload: HistoryAudioInput,
) -> Result<String, String> {
    save_history_audio(&app, payload.audio, payload.mime_type)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn history_read_audio(
    app: tauri::AppHandle,
    payload: HistoryReadAudioInput,
) -> Result<Vec<u8>, String> {
    read_history_audio(&app, payload.audio_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn notes_get(app: tauri::AppHandle, args: NotesListArgs) -> Result<NoteListResponse, String> {
    let page = args.page.unwrap_or(1).max(1);
    let page_size = args.page_size.unwrap_or(20).max(1);
    list_notes(&app, page, page_size)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn notes_create(app: tauri::AppHandle, payload: NoteCreateInput) -> Result<NoteEntry, String> {
    let entry = create_note(&app, payload)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("notes:updated", json!({"type": "added", "mode": "local", "entry": &entry}))
        .map_err(|error| error.to_string())?;
    Ok(entry)
}

#[tauri::command]
async fn notes_update(app: tauri::AppHandle, payload: NoteUpdateInput) -> Result<NoteEntry, String> {
    let entry = update_note(&app, payload)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("notes:updated", json!({"type": "updated", "mode": "local", "entry": &entry}))
        .map_err(|error| error.to_string())?;
    Ok(entry)
}

#[tauri::command]
async fn notes_delete(app: tauri::AppHandle, payload: NoteDeleteInput) -> Result<(), String> {
    let deleted_id = payload.id.clone();
    delete_note(&app, payload)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("notes:updated", json!({"type": "deleted", "mode": "local", "id": deleted_id}))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn notes_bulk_delete(
    app: tauri::AppHandle,
    payload: NoteBulkDeleteInput,
) -> Result<NoteBulkDeleteResponse, String> {
    let ids = payload.ids.clone();
    let response = bulk_delete_notes(&app, payload)
        .await
        .map_err(|error| error.to_string())?;
    app.emit("notes:updated", json!({"type": "bulk-deleted", "mode": "local", "ids": ids}))
        .map_err(|error| error.to_string())?;
    Ok(response)
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
async fn resources_sound_data(
    app: tauri::AppHandle,
    sound_name: String,
) -> Result<Vec<u8>, String> {
    resources::read_sound_file(&app, &sound_name)
        .ok_or_else(|| format!("Sound {sound_name} not found or could not be read"))
}

#[tauri::command]
async fn resources_play_sound(
    app: tauri::AppHandle,
    sound_name: String,
) -> Result<(), String> {
    audio::play_sound_sync(&app, &sound_name)
}

#[tauri::command]
async fn auth_consume_pending(
    queue: State<'_, Arc<AuthQueue>>,
) -> Result<Vec<AuthDeepLinkPayload>, String> {
    Ok(queue.drain().await)
}

#[tauri::command]
async fn auth_start_oauth(
    app: tauri::AppHandle,
    queue: State<'_, Arc<AuthQueue>>,
    oauth_state: State<'_, Arc<OAuthServerState>>,
    provider: String,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    
    // Если работаем от админа и OAuth сервер еще не запущен - запускаем
    if oauth::is_running_as_admin() {
        logging::log_message("[auth_start_oauth] Running as admin, starting OAuth server...");
        let app_clone = app.clone();
        let queue_clone = queue.inner().clone();
        let state_clone = oauth_state.inner().clone();
        
        // Запускаем сервер если еще не запущен
        match oauth_server::start_oauth_server(
            app_clone,
            queue_clone,
            state_clone.clone(),
        ).await {
            Ok(_) => {
                logging::log_message("[auth_start_oauth] OAuth server started successfully, waiting for listener...");
                // Ждём пока сервер будет готов принимать соединения (с таймаутом 2 секунды)
                tokio::select! {
                    _ = state_clone.wait_until_ready() => {
                        logging::log_message("[auth_start_oauth] OAuth server is ready");
                    }
                    _ = tokio::time::sleep(tokio::time::Duration::from_secs(2)) => {
                        logging::log_message("[auth_start_oauth] OAuth server ready timeout, continuing anyway");
                    }
                }
            }
            Err(e) => {
                logging::log_message(&format!("[auth_start_oauth] Failed to start OAuth server: {}", e));
                return Err(format!("Failed to start OAuth server: {}", e));
            }
        }
    } else {
        logging::log_message("[auth_start_oauth] Not running as admin, using deep link");
    }
    
    let url = oauth::build_oauth_start_url(&provider).map_err(|error| error.to_string())?;
    logging::log_message(&format!("[auth_start_oauth] Opening OAuth URL: {}", url));
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn auth_is_admin() -> Result<bool, String> {
    Ok(oauth::is_running_as_admin())
}

#[tauri::command]
async fn get_log_file_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(logging::get_log_file_path(&app)
        .and_then(|p| p.to_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "Log file path not available".to_string()))
}

#[tauri::command]
async fn open_file_path(_app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    use std::path::Path;
    println!("[open_file_path] Received request to open file: {}", file_path);
    
    let path = Path::new(&file_path);
    if !path.exists() {
        let msg = format!("File does not exist: {}", file_path);
        eprintln!("[open_file_path] Error: {}", msg);
        return Err(msg);
    }
    
    if !path.is_file() {
        let msg = format!("Path is not a file: {}", file_path);
        eprintln!("[open_file_path] Error: {}", msg);
        return Err(msg);
    }
    
    println!("[open_file_path] File exists, attempting to open: {}", file_path);
    
    let result = {
        #[cfg(target_os = "windows")]
        {
            // На Windows используем explorer для открытия файлов
            // explorer автоматически выберет правильное приложение для типа файла
            println!("[open_file_path] Attempting to open with explorer: {}", file_path);
            match std::process::Command::new("explorer")
                .arg(&file_path)
                .spawn()
            {
                Ok(mut child) => {
                    // Даем процессу немного времени
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            if status.success() {
                                println!("[open_file_path] Explorer command completed successfully");
                            } else {
                                eprintln!("[open_file_path] Explorer command failed with status: {:?}", status);
                            }
                        }
                        Ok(None) => {
                            println!("[open_file_path] Explorer process is running (expected behavior)");
                        }
                        Err(e) => {
                            eprintln!("[open_file_path] Error checking explorer process: {}", e);
                        }
                    }
                    println!("[open_file_path] Successfully spawned explorer command for file: {}", file_path);
                    Ok(())
                }
                Err(e) => {
                    eprintln!("[open_file_path] Failed to spawn explorer command: {}", e);
                    // Пробуем альтернативный способ через start
                    println!("[open_file_path] Trying alternative method with start command");
                    match std::process::Command::new("cmd")
                        .args(["/C", "start", "", &file_path])
                        .spawn()
                    {
                        Ok(_) => {
                            println!("[open_file_path] Successfully spawned start command for file: {}", file_path);
                            Ok(())
                        }
                        Err(e2) => {
                            let msg = format!("Failed to open file with both explorer and start. Explorer error: {}, Start error: {}", e, e2);
                            eprintln!("[open_file_path] Error: {}", msg);
                            Err(msg)
                        }
                    }
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            match std::process::Command::new("open")
                .arg(&file_path)
                .spawn()
            {
                Ok(_) => {
                    println!("[open_file_path] Successfully spawned command to open file: {}", file_path);
                    Ok(())
                }
                Err(e) => {
                    let msg = format!("Failed to spawn command: {}", e);
                    eprintln!("[open_file_path] Error: {}", msg);
                    Err(msg)
                }
            }
        }
        #[cfg(target_os = "linux")]
        {
            match std::process::Command::new("xdg-open")
                .arg(&file_path)
                .spawn()
            {
                Ok(_) => {
                    println!("[open_file_path] Successfully spawned command to open file: {}", file_path);
                    Ok(())
                }
                Err(e) => {
                    let msg = format!("Failed to spawn command: {}", e);
                    eprintln!("[open_file_path] Error: {}", msg);
                    Err(msg)
                }
            }
        }
    };
    result
}

#[tauri::command]
async fn local_speech_get_status(
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    Ok(manager.get_status().await)
}

#[tauri::command]
async fn local_speech_check_health(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
) -> Result<FastWhisperStatus, String> {
    Ok(manager.check_health(&app).await)
}

#[tauri::command]
async fn local_speech_install(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
    args: InstallArgs,
) -> Result<FastWhisperStatus, String> {
    let resolved_target = args.target_dir.clone();
    if resolved_target.is_none() {
        return Err("Путь установки не выбран".into());
    }

    let selected = persist_install_dir_choice(&app, resolved_target.clone())
        .await
        .map_err(|error| error.to_string())?;
    if let Some(path) = selected {
        manager.set_install_override(Some(path)).await;
    } else {
        return Err(format!(
            "Путь установки не выбран (target_dir from UI: {:?})",
            resolved_target
        ));
    }
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
    args: InstallArgs,
) -> Result<FastWhisperStatus, String> {
    let resolved_target = args.target_dir.clone();
    if resolved_target.is_none() {
        return Err("Путь установки не выбран".into());
    }

    let selected = persist_install_dir_choice(&app, resolved_target.clone())
        .await
        .map_err(|error| error.to_string())?;
    if let Some(path) = selected {
        manager.set_install_override(Some(path)).await;
    } else {
        return Err(format!(
            "Путь установки не выбран (target_dir from UI: {:?})",
            resolved_target
        ));
    }
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
async fn local_speech_check_model_downloaded(
    app: tauri::AppHandle,
    manager: State<'_, Arc<FastWhisperManager>>,
    model: String,
) -> Result<bool, String> {
    let normalized = model.trim().to_string();
    manager
        .is_model_downloaded(&app, &normalized)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_check_installed() -> Result<bool, String> {
    ollama::check_installed()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_is_server_running() -> Result<bool, String> {
    Ok(ollama::is_server_running().await)
}

#[tauri::command]
async fn ollama_list_models() -> Result<Vec<String>, String> {
    ollama::list_models()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_pull_model(model: String) -> Result<(), String> {
    ollama::pull_model(&model)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_warmup_model(model: String) -> Result<(), String> {
    ollama::warmup_model(&model)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_chat_completions(
    model: String,
    messages: Vec<ollama::ChatMessage>,
) -> Result<serde_json::Value, String> {
    ollama::chat_completions(&model, messages)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn ollama_chat_completions_stream(
    app: tauri::AppHandle,
    model: String,
    messages: Vec<ollama::ChatMessage>,
    stream_id: String,
) -> Result<String, String> {
    ollama::chat_completions_stream(app, &model, messages, &stream_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn openai_chat_completions(
    api_key: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    openai::chat_completions(&api_key, body)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn openai_chat_completions_stream(
    app: tauri::AppHandle,
    api_key: String,
    body: serde_json::Value,
    stream_id: String,
) -> Result<String, String> {
    openai::chat_completions_stream(app, &api_key, body, &stream_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn gemini_generate_content_stream(
    app: tauri::AppHandle,
    api_key: String,
    model: String,
    body: serde_json::Value,
    stream_id: String,
) -> Result<String, String> {
    gemini::stream_generate_content(app, &api_key, &model, body, &stream_id)
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
async fn window_open_devtools(_app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(feature = "devtools")]
    {
        if let Some(window) = _app.get_webview_window("main") {
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

#[cfg(target_os = "windows")]
unsafe fn update_window_ex_style(hwnd: winapi::shared::windef::HWND, ignore: bool) {
    use winapi::um::winuser::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOP, SWP_FRAMECHANGED,
        SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_TRANSPARENT, WS_EX_LAYERED,
    };

    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    let base_style = ex_style | WS_EX_LAYERED;
    let new_ex_style = if ignore {
        base_style | WS_EX_TRANSPARENT
    } else {
        base_style & !WS_EX_TRANSPARENT
    };

    if new_ex_style != ex_style {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex_style as isize);
        SetWindowPos(
            hwnd,
            HWND_TOP,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        );
    }
}

#[tauri::command]
async fn window_set_ignore_cursor_events(
    app: tauri::AppHandle,
    label: String,
    ignore: bool,
    skip_native: Option<bool>,
) -> Result<(), String> {
    let mut window = app.get_webview_window(&label);
    if window.is_none() {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        window = app.get_webview_window(&label);
    }

    if let Some(window) = window {
        let skip_native_call = skip_native.unwrap_or(false);
        if !skip_native_call {
            window
                .set_ignore_cursor_events(ignore)
                .map_err(|e| format!("Failed to set ignore cursor events: {}", e))?;
        }

        #[cfg(target_os = "windows")]
        {
            let hwnd = window.hwnd().map_err(|e| format!("Failed to get HWND: {}", e))?;
            unsafe {
                let hwnd_ptr: winapi::shared::windef::HWND = std::mem::transmute(hwnd.0);
                update_window_ex_style(hwnd_ptr, ignore);
            }
        }
        Ok(())
    } else {
        Ok(())
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
            .shadow(false)
            .transparent(true)
            .background_color(Color(0, 0, 0, 0))
            .build()
            .map_err(|e| format!("Failed to create main window: {}", e))?;
        
        window.show().map_err(|e| format!("Failed to show main window: {}", e))?;
        window.set_focus().map_err(|e| format!("Failed to focus main window: {}", e))?;
        Ok(())
    }
}


fn main() {
    // Проверяем, запущены ли мы с deep link аргументом
    // Если да - записываем в файл для главного процесса (обход UIPI)
    let args: Vec<String> = std::env::args().collect();
    if let Some(url) = args.iter().find(|arg| arg.starts_with("winky://")) {
        println!("[Main] Started with deep link argument: {}", url);
        // Записываем URL в файл для главного процесса
        if let Err(e) = deep_link_file::write_deep_link_to_file(url) {
            eprintln!("[Main] Failed to write deep link to file: {}", e);
        } else {
            println!("[Main] Deep link written to file successfully");
        }
        // Не выходим - пусть single-instance попробует передать через IPC тоже
    }
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(url) = args.into_iter().find(|arg| arg.starts_with("winky://")) {
                logging::log_message(&format!("[SingleInstance] Received deep link: {}", url));
                if let Some(state) = app.try_state::<Arc<AuthQueue>>() {
                    dispatch_deep_link(app, state.inner().clone(), url);
                } else {
                    logging::log_message("[SingleInstance] AuthQueue not ready, saving to pending");
                    PENDING_DEEP_LINKS.lock().unwrap().push(url);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let app_handle = app.handle();
            
            // Инициализируем логирование в файл (безопасно, не падаем если не получилось)
            let _ = logging::init_logging(&app_handle);
            logging::log_message("Winky application started");
            
            let config_state =
                Arc::new(tauri::async_runtime::block_on(ConfigState::initialize(&app_handle))?);
            let initial_config = tauri::async_runtime::block_on(config_state.get());

            let hotkeys = Arc::new(HotkeyState::new());
            let fast_whisper = Arc::new(FastWhisperManager::new());
            let auth_queue = Arc::new(AuthQueue::new());
            let oauth_server_state = Arc::new(OAuthServerState::new());

            app.manage(config_state);
            app.manage(hotkeys.clone());
            app.manage(fast_whisper.clone());
            app.manage(auth_queue.clone());
            app.manage(oauth_server_state.clone());

            setup_deep_link_listener(&app_handle, auth_queue.clone());
            tray::setup(&app_handle)?;
            
            // Проверяем файл deep link при старте
            deep_link_file::check_deep_link_file_on_startup(&app_handle, &auth_queue);
            
            // Запускаем polling для чтения deep link из файла (обход UIPI при запуске от админа)
            deep_link_file::start_deep_link_file_polling(app_handle.clone(), auth_queue.clone());
            
            // Запускаем OAuth HTTP сервер при работе от администратора
            // Это нужно потому что deep link не работает из-за UIPI
            if oauth::is_running_as_admin() {
                logging::log_message("[Main] Running as admin, starting OAuth HTTP server...");
                let app_for_oauth = app_handle.clone();
                let queue_for_oauth = auth_queue.clone();
                let state_for_oauth = oauth_server_state.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = oauth_server::start_oauth_server(
                        app_for_oauth,
                        queue_for_oauth,
                        state_for_oauth,
                    ).await {
                        logging::log_message(&format!("[Main] Failed to start OAuth server: {}", e));
                    }
                });
            }
            
            // Синхронизируем автозапуск с настройками при инициализации
            if let Err(e) = update_autostart(&app_handle, initial_config.launch_on_system_startup) {
                eprintln!("Failed to sync autostart on init: {}", e);
            }
            
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
            history_get,
            history_add,
            history_clear,
            history_save_audio,
            history_read_audio,
            notes_get,
            notes_create,
            notes_update,
            notes_delete,
            notes_bulk_delete,
            resources_sound_path,
            resources_sound_data,
            resources_play_sound,
            auth_consume_pending,
            auth_start_oauth,
            auth_is_admin,
            get_log_file_path,
            open_file_path,
            local_speech_get_status,
            local_speech_check_health,
            local_speech_install,
            local_speech_start,
            local_speech_restart,
            local_speech_reinstall,
            local_speech_stop,
            local_speech_check_model_downloaded,
            ollama_check_installed,
            ollama_is_server_running,
            ollama_list_models,
            ollama_pull_model,
            ollama_warmup_model,
            ollama_chat_completions,
            ollama_chat_completions_stream,
            openai_chat_completions,
            openai_chat_completions_stream,
            gemini_generate_content_stream,
            action_hotkeys_register,
            action_hotkeys_clear,
            window_open_devtools,
            window_open_main,
            window_set_ignore_cursor_events
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

fn update_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), Box<dyn std::error::Error>> {
    let autostart_manager = app.autolaunch();
    if enabled {
        autostart_manager.enable()?;
    } else {
        autostart_manager.disable()?;
    }
    Ok(())
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
            // Check if server is already healthy before attempting to start
            // This prevents unnecessary restart cycles
            if !manager.is_server_healthy().await {
                let _ = manager.start_existing(&app_handle).await;
            }
        });
    }

    if config.setup_completed && config.mic_show_on_launch {
        let _ = app.emit("mic:show-request", json!({ "reason": "auto" }));
    }
}

pub(crate) fn dispatch_deep_link(app: &tauri::AppHandle, queue: Arc<AuthQueue>, url: String) {
    tauri::async_runtime::spawn(auth::handle_deep_link(
        app.clone(),
        queue,
        url,
    ));
}
