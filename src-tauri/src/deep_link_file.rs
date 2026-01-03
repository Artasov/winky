//! Модуль для обмена deep link URL через файл.
//! Используется для обхода UIPI при запуске от администратора.
//!
//! Когда браузер редиректит на winky://, Windows запускает новый процесс.
//! Если главный процесс запущен с правами админа, IPC блокируется UIPI.
//! Этот модуль использует файл для передачи URL между процессами.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::time::{Duration, interval};
use tauri::{AppHandle, Manager};

use crate::auth::AuthQueue;
use crate::logging;

const DEEP_LINK_FILE_NAME: &str = "pending_deep_link.txt";
const POLL_INTERVAL_MS: u64 = 500;

/// Получает путь к файлу для deep link
fn get_deep_link_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join(DEEP_LINK_FILE_NAME))
}

/// Получает путь к файлу для deep link (без AppHandle, для использования при старте)
pub fn get_deep_link_file_path_standalone() -> Option<PathBuf> {
    // Используем стандартный путь AppData\Local\xldev-winky
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        let path = PathBuf::from(local_app_data).join("xldev-winky").join(DEEP_LINK_FILE_NAME);
        return Some(path);
    }
    None
}

/// Записывает deep link URL в файл (вызывается из нового процесса)
pub fn write_deep_link_to_file(url: &str) -> Result<(), String> {
    let file_path = get_deep_link_file_path_standalone()
        .ok_or_else(|| "Failed to get deep link file path".to_string())?;
    
    // Создаём директорию если не существует
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    fs::write(&file_path, url)
        .map_err(|e| format!("Failed to write deep link file: {}", e))?;
    
    println!("[DeepLinkFile] Wrote URL to file: {}", file_path.display());
    Ok(())
}

/// Читает и удаляет deep link URL из файла
fn read_and_remove_deep_link_file(app: &AppHandle) -> Option<String> {
    let file_path = get_deep_link_file_path(app)?;
    
    if !file_path.exists() {
        return None;
    }
    
    let content = fs::read_to_string(&file_path).ok()?;
    let url = content.trim().to_string();
    
    if url.is_empty() {
        let _ = fs::remove_file(&file_path);
        return None;
    }
    
    // Удаляем файл после чтения
    let _ = fs::remove_file(&file_path);
    
    logging::log_message(&format!("[DeepLinkFile] Read URL from file: {}", url));
    Some(url)
}

/// Запускает polling для проверки deep link файла
pub fn start_deep_link_file_polling(app: AppHandle, queue: Arc<AuthQueue>) {
    logging::log_message("[DeepLinkFile] Starting file polling for deep links...");
    
    tauri::async_runtime::spawn(async move {
        let mut ticker = interval(Duration::from_millis(POLL_INTERVAL_MS));
        
        loop {
            ticker.tick().await;
            
            if let Some(url) = read_and_remove_deep_link_file(&app) {
                logging::log_message(&format!("[DeepLinkFile] Found deep link in file: {}", url));
                crate::dispatch_deep_link(&app, queue.clone(), url);
            }
        }
    });
}

/// Проверяет и обрабатывает deep link файл при старте (синхронно)
pub fn check_deep_link_file_on_startup(app: &AppHandle, queue: &Arc<AuthQueue>) {
    if let Some(url) = read_and_remove_deep_link_file(app) {
        logging::log_message(&format!("[DeepLinkFile] Found pending deep link on startup: {}", url));
        let app_clone = app.clone();
        let queue_clone = queue.clone();
        tauri::async_runtime::spawn(async move {
            crate::auth::handle_deep_link(app_clone, queue_clone, url).await;
        });
    }
}

