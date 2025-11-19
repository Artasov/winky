use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Debug, Default)]
pub struct HotkeyState {
    mic: Mutex<Option<String>>,
    actions: Mutex<HashMap<String, String>>,
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
        match manager.on_shortcut(accelerator.as_str(), move |app_handle, _, _| {
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

        for entry in hotkeys {
            let accelerator = entry.accelerator.trim();
            if accelerator.is_empty() {
                continue;
            }
            if used.contains_key(accelerator) {
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
                    used.insert(accelerator_str.clone(), entry.id.clone());
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
        for (_, accelerator) in self.actions.lock().unwrap().drain() {
            let _ = manager.unregister(accelerator.as_str());
        }
    }
}
