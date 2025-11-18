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
        if let Some(existing) = self.mic.lock().unwrap().take() {
            let _ = manager.unregister(existing.as_str());
            let _ = app.emit(
                "hotkey:register-cleared",
                &serde_json::json!({"source": "mic"}),
            );
        }

        let Some(raw) = accelerator.and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }) else {
            return;
        };

        let accelerator = raw.clone();
        match manager.on_shortcut(accelerator.as_str(), move |app_handle, _, _| {
            let _ = app_handle.emit("mic:shortcut", serde_json::json!({"reason": "shortcut"}));
        }) {
            Ok(_) => {
                *self.mic.lock().unwrap() = Some(accelerator.clone());
                let _ = app.emit(
                    "hotkey:register-success",
                    &serde_json::json!({
                        "source": "mic",
                        "accelerator": accelerator
                    }),
                );
            }
            Err(error) => {
                let _ = app.emit(
                    "hotkey:register-error",
                    &serde_json::json!({
                        "source": "mic",
                        "accelerator": accelerator,
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
