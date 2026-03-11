//! Module for completion-sound playback via native APIs.

use tauri::AppHandle;

use crate::{logging, resources};

// Constants for PlaySoundW
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

#[cfg(target_os = "windows")]
pub fn play_sound_sync(app: &AppHandle, sound_name: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::thread;
    use std::time::Duration;

    let path = resources::resolve_sound_path(app, sound_name)
        .ok_or_else(|| format!("Sound {sound_name} not found"))?;

    let wide: Vec<u16> = OsStr::new(&path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut attempts = 0;
    while attempts < 3 {
        attempts += 1;
        let result = unsafe {
            PlaySoundW(
                wide.as_ptr(),
                std::ptr::null_mut(),
                SND_FILENAME | SND_ASYNC | SND_NODEFAULT,
            )
        };

        if result != 0 {
            let message = format!("[Audio] Playing sound: {path}");
            logging::log_message(&message);
            println!("{}", message);
            return Ok(());
        }

        if attempts < 3 {
            thread::sleep(Duration::from_millis(180));
        }
    }

    let os_error = std::io::Error::last_os_error();
    let message = format!(
        "[Audio] Failed to play sound after {attempts} attempts: {path}. OS error: {os_error}"
    );
    logging::log_message(&message);
    Err(format!("Failed to play sound: {path}. OS error: {os_error}"))
}

#[cfg(target_os = "macos")]
pub fn play_sound_sync(app: &AppHandle, sound_name: &str) -> Result<(), String> {
    use std::process::Command;

    let path = resources::resolve_sound_path(app, sound_name)
        .ok_or_else(|| format!("Sound {sound_name} not found"))?;

    Command::new("afplay")
        .arg(&path)
        .spawn()
        .map_err(|error| format!("Failed to play sound: {error}"))?;

    let message = format!("[Audio] Playing sound: {path}");
    logging::log_message(&message);
    println!("{}", message);
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn play_sound_sync(app: &AppHandle, sound_name: &str) -> Result<(), String> {
    use std::process::Command;

    let path = resources::resolve_sound_path(app, sound_name)
        .ok_or_else(|| format!("Sound {sound_name} not found"))?;

    let players = ["paplay", "aplay", "play"];
    for player in players {
        if Command::new(player).arg(&path).spawn().is_ok() {
            let message = format!("[Audio] Playing sound via {player}: {path}");
            logging::log_message(&message);
            println!("{}", message);
            return Ok(());
        }
    }

    let message = "[Audio] No audio player found (tried paplay, aplay, play)".to_string();
    logging::log_message(&message);
    Err("No audio player found (tried paplay, aplay, play)".into())
}
