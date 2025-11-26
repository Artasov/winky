use std::fs;
use tauri::{path::BaseDirectory, AppHandle, Manager};

pub fn resolve_sound_path(app: &AppHandle, sound_name: &str) -> Option<String> {
    let relative = format!("sounds/{}", sound_name);
    
    // В dev режиме пробуем через current_dir
    if let Ok(current_dir) = std::env::current_dir() {
        let alt_path = current_dir.join("resources").join("sounds").join(sound_name);
        if alt_path.exists() {
            return Some(alt_path.to_string_lossy().to_string());
        }
    }
    
    // Пробуем через BaseDirectory::Resource (работает в production)
    // Это должно возвращать путь к ресурсам в папке установки
    if let Ok(resource_path) = app.path().resolve(&relative, BaseDirectory::Resource) {
        if resource_path.exists() {
            // Возвращаем путь с правильными разделителями для Windows
            #[cfg(target_os = "windows")]
            {
                return Some(resource_path.to_string_lossy().replace('/', "\\").to_string());
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Some(resource_path.to_string_lossy().to_string());
            }
        }
    }
    
    // Пробуем через resource_dir()
    if let Ok(resource_dir) = app.path().resource_dir() {
        let dev_path = resource_dir.join(&relative);
        if dev_path.exists() {
            #[cfg(target_os = "windows")]
            {
                return Some(dev_path.to_string_lossy().replace('/', "\\").to_string());
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Some(dev_path.to_string_lossy().to_string());
            }
        }
        let alt_path = resource_dir.join("sounds").join(sound_name);
        if alt_path.exists() {
            #[cfg(target_os = "windows")]
            {
                return Some(alt_path.to_string_lossy().replace('/', "\\").to_string());
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Some(alt_path.to_string_lossy().to_string());
            }
        }
    }
    
    None
}

pub fn read_sound_file(app: &AppHandle, sound_name: &str) -> Option<Vec<u8>> {
    let path = resolve_sound_path(app, sound_name)?;
    fs::read(&path).ok()
}
