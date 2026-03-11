use std::fs;
use std::path::{Path, PathBuf};
use tauri::{path::BaseDirectory, AppHandle, Manager};

fn to_platform_string(path: &Path) -> String {
    #[cfg(target_os = "windows")]
    {
        path.to_string_lossy().replace('/', "\\")
    }
    #[cfg(not(target_os = "windows"))]
    {
        path.to_string_lossy().to_string()
    }
}

fn normalize_existing_path(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    Some(to_platform_string(&resolved))
}

fn candidate_paths(app: &AppHandle, sound_name: &str) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let relative = format!("sounds/{}", sound_name);

    if let Ok(resolved) = app.path().resolve(&relative, BaseDirectory::Resource) {
        candidates.push(resolved);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("sounds").join(sound_name));
        candidates.push(resource_dir.join("resources").join("sounds").join(sound_name));
        if let Some(parent) = resource_dir.parent() {
            candidates.push(parent.join("resources").join("sounds").join(sound_name));
            candidates.push(parent.join("Resources").join("sounds").join(sound_name));
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("sounds").join(sound_name));
            candidates.push(exe_dir.join("resources").join("sounds").join(sound_name));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join("resources").join("sounds").join(sound_name));
                candidates.push(parent.join("Resources").join("sounds").join(sound_name));
            }
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("resources").join("sounds").join(sound_name));
        candidates.push(current_dir.join("src-tauri").join("resources").join("sounds").join(sound_name));
    }

    candidates
}

pub fn resolve_sound_path(app: &AppHandle, sound_name: &str) -> Option<String> {
    candidate_paths(app, sound_name)
        .iter()
        .find_map(|path| normalize_existing_path(path))
}

pub fn read_sound_file(app: &AppHandle, sound_name: &str) -> Option<Vec<u8>> {
    let path = resolve_sound_path(app, sound_name)?;
    fs::read(path).ok()
}
