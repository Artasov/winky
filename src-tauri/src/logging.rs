//! Модуль для логирования в файл.
//! В release версии консоль скрыта, поэтому логи пишем в файл.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri::{AppHandle, Manager};

static LOG_FILE: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// Инициализирует логирование в файл
/// Логи сохраняются в папке установки приложения рядом с exe файлом
pub fn init_logging(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Пробуем получить папку ресурсов (рядом с exe в production)
    let log_dir = match app.path().resource_dir() {
        Ok(dir) => dir,
        Err(_) => {
            // Fallback: пробуем получить папку exe
            std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
                .ok_or_else(|| "Failed to get resource dir or exe dir".to_string())?
        }
    };
    
    // Создаём папку если её нет (на случай если это не resource_dir)
    if let Err(_) = std::fs::create_dir_all(&log_dir) {
        // Если не получилось создать, пробуем использовать текущую директорию
        let fallback_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let log_file = fallback_dir.join("winky.log");
        *LOG_FILE.lock().unwrap() = Some(log_file);
        return Ok(());
    }
    
    let log_file = log_dir.join("winky.log");
    
    // Очищаем старый лог если он больше 10MB
    if let Ok(metadata) = std::fs::metadata(&log_file) {
        if metadata.len() > 10 * 1024 * 1024 {
            let _ = std::fs::remove_file(&log_file);
        }
    }
    
    *LOG_FILE.lock().unwrap() = Some(log_file.clone());
    
    // Пишем начальное сообщение
    log_message("=== Winky started ===");
    
    Ok(())
}

/// Получает путь к файлу логов
pub fn get_log_file_path(app: &AppHandle) -> Option<PathBuf> {
    // Сначала пробуем из статической переменной
    if let Ok(guard) = LOG_FILE.lock() {
        if let Some(ref path) = *guard {
            return Some(path.clone());
        }
    }
    
    // Fallback: пробуем получить из resource_dir
    if let Ok(resource_dir) = app.path().resource_dir() {
        Some(resource_dir.join("winky.log"))
    } else if let Ok(exe_path) = std::env::current_exe() {
        exe_path.parent().map(|p| p.join("winky.log"))
    } else {
        None
    }
}

/// Записывает сообщение в лог файл
/// Безопасная функция - не падает если логирование не работает
pub fn log_message(message: &str) {
    // Пробуем записать в файл, но не падаем если не получилось
    if let Ok(guard) = LOG_FILE.lock() {
        if let Some(log_path) = guard.as_ref() {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)
            {
                let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
                let _ = writeln!(file, "[{}] {}", timestamp, message);
                let _ = file.flush();
            }
        }
    }
    
    // Также выводим в консоль (в debug режиме это будет видно)
    #[cfg(debug_assertions)]
    println!("{}", message);
}

/// Макрос для логирования с форматированием
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => {
        $crate::logging::log_message(&format!($($arg)*));
    };
}

