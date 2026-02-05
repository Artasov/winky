use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Debug, Default)]
pub struct HotkeyState {
    mic: Mutex<Option<String>>,
    actions: Mutex<HashMap<String, String>>,
    mic_action_overrides: Mutex<HashMap<String, String>>,
    recording_active: AtomicBool,
}

#[derive(Debug, Deserialize)]
pub struct ActionHotkeyInput {
    pub id: String,
    pub accelerator: String,
}

impl HotkeyState {
    pub fn new() -> Self {
        Self::default()
    }

    fn normalize_accelerator(accelerator: &str) -> String {
        accelerator
            .split_whitespace()
            .collect::<String>()
            .to_ascii_lowercase()
    }

    fn action_for_mic_accelerator(&self, accelerator: &str) -> Option<String> {
        let normalized = Self::normalize_accelerator(accelerator);
        self.mic_action_overrides
            .lock()
            .unwrap()
            .get(&normalized)
            .cloned()
    }

    pub fn set_recording_active(&self, active: bool) {
        self.recording_active.store(active, Ordering::Relaxed);
    }

    fn is_recording_active(&self) -> bool {
        self.recording_active.load(Ordering::Relaxed)
    }

    pub fn register_mic(&self, app: &AppHandle, accelerator: Option<String>) {
        let manager = app.global_shortcut();
        
        // Получаем новый хоткей
        let new_accelerator = accelerator.and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });

        // Проверяем текущий зарегистрированный хоткей
        let mut current = self.mic.lock().unwrap();
        
        // Если новый хоткей такой же, как текущий, ничего не делаем
        if let Some(ref existing) = *current {
            if let Some(ref new_accel) = new_accelerator {
                if existing == new_accel {
                    // Хоткей не изменился, не нужно перерегистрировать
                    return;
                }
            }
        }
        
        // Если новый хоткей None, но текущий есть - очищаем
        if new_accelerator.is_none() {
            if let Some(existing) = current.take() {
                let _ = manager.unregister(existing.as_str());
                let _ = app.emit(
                    "hotkey:register-cleared",
                    &serde_json::json!({"source": "mic"}),
                );
            }
            return;
        }

        // Удаляем старый хоткей, если он есть
        if let Some(existing) = current.take() {
            let _ = manager.unregister(existing.as_str());
            let _ = app.emit(
                "hotkey:register-cleared",
                &serde_json::json!({"source": "mic"}),
            );
        }

        // Регистрируем новый хоткей
        let accelerator = new_accelerator.unwrap();
        let accelerator_clone = accelerator.clone();
        let accelerator_for_handler = accelerator.clone();
        match manager.on_shortcut(accelerator.as_str(), move |app_handle, _, _| {
            if let Some(hotkeys) = app_handle.try_state::<Arc<HotkeyState>>() {
                if hotkeys.is_recording_active() {
                    if let Some(action_id) = hotkeys.action_for_mic_accelerator(&accelerator_for_handler) {
                        let _ = app_handle.emit(
                            "hotkey:action-triggered",
                            serde_json::json!({"actionId": action_id}),
                        );
                        return;
                    }
                }
            }
            let _ = app_handle.emit("mic:shortcut", serde_json::json!({"reason": "shortcut"}));
        }) {
            Ok(_) => {
                *current = Some(accelerator_clone.clone());
                let _ = app.emit(
                    "hotkey:register-success",
                    &serde_json::json!({
                        "source": "mic",
                        "accelerator": accelerator_clone
                    }),
                );
            }
            Err(error) => {
                let _ = app.emit(
                    "hotkey:register-error",
                    &serde_json::json!({
                        "source": "mic",
                        "accelerator": accelerator_clone,
                        "reason": "register-failed",
                        "message": error.to_string()
                    }),
                );
            }
        }
    }

    pub fn register_action_hotkeys(&self, app: &AppHandle, hotkeys: Vec<ActionHotkeyInput>) {
        self.clear_action_hotkeys(app);
        if hotkeys.is_empty() {
            return;
        }

        let manager = app.global_shortcut();
        let mut used = HashMap::new();
        let mic_hotkey = self
            .mic
            .lock()
            .unwrap()
            .as_ref()
            .map(|value| Self::normalize_accelerator(value));

        for entry in hotkeys {
            let accelerator = entry.accelerator.trim();
            if accelerator.is_empty() {
                continue;
            }
            let normalized = Self::normalize_accelerator(accelerator);
            if used.contains_key(&normalized) {
                let _ = app.emit(
                    "hotkey:register-error",
                    &serde_json::json!({
                        "source": "action",
                        "actionId": entry.id,
                        "accelerator": accelerator,
                        "reason": "duplicate"
                    }),
                );
                continue;
            }
            if mic_hotkey.as_ref() == Some(&normalized) {
                used.insert(normalized.clone(), entry.id.clone());
                self.mic_action_overrides
                    .lock()
                    .unwrap()
                    .insert(normalized, entry.id.clone());
                continue;
            }
            let action_id = entry.id.clone();
            let handler_action_id = action_id.clone();
            let accelerator_str = accelerator.to_string();
            match manager.on_shortcut(accelerator_str.as_str(), move |app_handle, _, _| {
                let _ = app_handle.emit(
                    "hotkey:action-triggered",
                    serde_json::json!({"actionId": handler_action_id.clone()}),
                );
            }) {
                Ok(_) => {
                    used.insert(normalized, entry.id.clone());
                    self.actions
                        .lock()
                        .unwrap()
                        .insert(entry.id, accelerator_str);
                }
                Err(error) => {
                    let _ = app.emit(
                        "hotkey:register-error",
                        &serde_json::json!({
                            "source": "action",
                            "actionId": action_id,
                            "accelerator": accelerator,
                            "reason": "register-failed",
                            "message": error.to_string()
                        }),
                    );
                }
            }
        }
    }

    pub fn clear_action_hotkeys(&self, app: &AppHandle) {
        let manager = app.global_shortcut();
        self.mic_action_overrides.lock().unwrap().clear();
        for (_, accelerator) in self.actions.lock().unwrap().drain() {
            let _ = manager.unregister(accelerator.as_str());
        }
    }
}
