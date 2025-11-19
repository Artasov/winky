use tauri::{path::BaseDirectory, AppHandle, Manager};

pub fn resolve_sound_path(app: &AppHandle, sound_name: &str) -> Option<String> {
    let relative = format!("sounds/{sound_name}");
    app.path()
        .resolve(&relative, BaseDirectory::Resource)
        .ok()
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
}
