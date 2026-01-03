//! Модуль для воспроизведения звука через native API.
//! Используется как более надёжная альтернатива HTML Audio API.

use tauri::AppHandle;
use crate::resources;

// Константы для PlaySoundW
#[cfg(target_os = "windows")]
const SND_FILENAME: u32 = 0x00020000;
#[cfg(target_os = "windows")]
const SND_ASYNC: u32 = 0x0001;
#[cfg(target_os = "windows")]
const SND_NODEFAULT: u32 = 0x0002;

#[cfg(target_os = "windows")]
#[link(name = "winmm")]
extern "system" {
    fn PlaySoundW(pszSound: *const u16, hmod: *mut std::ffi::c_void, fdwSound: u32) -> i32;
}

/// Воспроизводит звук из ресурсов приложения
#[cfg(target_os = "windows")]
pub fn play_sound_sync(app: &AppHandle, sound_name: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    
    let path = resources::resolve_sound_path(app, sound_name)
        .ok_or_else(|| format!("Sound {} not found", sound_name))?;
    
    // Конвертируем путь в wide string для Windows API
    let wide: Vec<u16> = OsStr::new(&path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    
    let result = unsafe {
        PlaySoundW(wide.as_ptr(), std::ptr::null_mut(), SND_FILENAME | SND_ASYNC | SND_NODEFAULT)
    };
    
    if result == 0 {
        Err(format!("Failed to play sound: {}", path))
    } else {
        println!("[Audio] Playing sound: {}", path);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub fn play_sound_sync(app: &AppHandle, sound_name: &str) -> Result<(), String> {
    use std::process::Command;
    
    let path = resources::resolve_sound_path(app, sound_name)
        .ok_or_else(|| format!("Sound {} not found", sound_name))?;
    
    Command::new("afplay")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to play sound: {}", e))?;
    
    println!("[Audio] Playing sound: {}", path);
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn play_sound_sync(app: &AppHandle, sound_name: &str) -> Result<(), String> {
    use std::process::Command;
    
    let path = resources::resolve_sound_path(app, sound_name)
        .ok_or_else(|| format!("Sound {} not found", sound_name))?;
    
    // Пробуем разные аудио плееры
    let players = ["paplay", "aplay", "play"];
    for player in players {
        if Command::new(player)
            .arg(&path)
            .spawn()
            .is_ok()
        {
            println!("[Audio] Playing sound via {}: {}", player, path);
            return Ok(());
        }
    }
    
    Err("No audio player found (tried paplay, aplay, play)".into())
}

