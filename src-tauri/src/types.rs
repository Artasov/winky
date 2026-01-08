use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::constants::{DEFAULT_LLM_MODEL, DEFAULT_MIC_ANCHOR, DEFAULT_SPEECH_MODEL};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokens {
    pub access: String,
    pub refresh: Option<String>,
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechConfig {
    #[serde(default = "speech_mode_default")]
    pub mode: String,
    #[serde(default = "default_speech_model")]
    pub model: String,
}

fn speech_mode_default() -> String {
    "api".to_string()
}

fn default_speech_model() -> String {
    DEFAULT_SPEECH_MODEL.to_string()
}

impl Default for SpeechConfig {
    fn default() -> Self {
        Self {
            mode: speech_mode_default(),
            model: default_speech_model(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmConfig {
    #[serde(default = "llm_mode_default")]
    pub mode: String,
    #[serde(default = "default_llm_model")]
    pub model: String,
}

fn llm_mode_default() -> String {
    "api".to_string()
}

fn default_llm_model() -> String {
    DEFAULT_LLM_MODEL.to_string()
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            mode: llm_mode_default(),
            model: default_llm_model(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeys {
    #[serde(default)]
    pub openai: String,
    #[serde(default)]
    pub google: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub auth: AuthTokens,
    #[serde(default)]
    pub setup_completed: bool,
    #[serde(default)]
    pub speech: SpeechConfig,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default)]
    pub api_keys: ApiKeys,
    #[serde(default)]
    pub actions: Vec<serde_json::Value>,
    #[serde(default)]
    pub mic_window_position: Option<WindowPosition>,
    #[serde(default = "default_mic_hotkey")]
    pub mic_hotkey: String,
    #[serde(default = "default_mic_anchor")]
    pub mic_anchor: String,
    #[serde(default = "default_true")]
    pub mic_auto_start_recording: bool,
    #[serde(default = "default_true")]
    pub mic_hide_on_stop_recording: bool,
    #[serde(default = "default_false")]
    pub mic_show_on_launch: bool,
    #[serde(default)]
    pub launch_on_system_startup: bool,
    #[serde(default)]
    pub auto_start_local_speech_server: bool,
    #[serde(default = "default_completion_volume")]
    pub completion_sound_volume: f32,
    #[serde(default = "default_true")]
    pub completion_sound_enabled: bool,
    #[serde(default = "default_true")]
    pub show_avatar_video: bool,
    #[serde(default = "default_notes_storage_mode")]
    pub notes_storage_mode: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            auth: AuthTokens::default(),
            setup_completed: false,
            speech: SpeechConfig::default(),
            llm: LlmConfig::default(),
            api_keys: ApiKeys::default(),
            actions: Vec::new(),
            mic_window_position: None,
            mic_hotkey: default_mic_hotkey(),
            mic_anchor: default_mic_anchor(),
            mic_auto_start_recording: default_true(),
            mic_hide_on_stop_recording: default_true(),
            mic_show_on_launch: default_false(),
            launch_on_system_startup: false,
            auto_start_local_speech_server: false,
            completion_sound_volume: default_completion_volume(),
            completion_sound_enabled: default_true(),
            show_avatar_video: default_true(),
            notes_storage_mode: default_notes_storage_mode(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

fn default_completion_volume() -> f32 {
    1.0
}

fn default_mic_anchor() -> String {
    DEFAULT_MIC_ANCHOR.to_string()
}

fn default_mic_hotkey() -> String {
    "Alt+Q".to_string()
}

fn default_notes_storage_mode() -> String {
    "api".to_string()
}

impl AppConfig {
    pub fn normalize(&mut self) {
        if self.speech.mode.trim().is_empty() {
            self.speech.mode = speech_mode_default();
        }
        if self.speech.model.trim().is_empty() {
            self.speech.model = default_speech_model();
        }
        if self.llm.mode.trim().is_empty() {
            self.llm.mode = llm_mode_default();
        }
        if self.llm.model.trim().is_empty() {
            self.llm.model = default_llm_model();
        }
        if self.mic_anchor.trim().is_empty() {
            self.mic_anchor = default_mic_anchor();
        }
        if self.api_keys.openai.trim().is_empty() {
            self.api_keys.openai = String::new();
        }
        if self.api_keys.google.trim().is_empty() {
            self.api_keys.google = String::new();
        }
        if self.notes_storage_mode.trim().is_empty() {
            self.notes_storage_mode = default_notes_storage_mode();
        }
        if self.auth.access.is_empty() && !self.auth.access_token.is_empty() {
            self.auth.access = self.auth.access_token.clone();
        }
        if self.auth.access_token.is_empty() && !self.auth.access.is_empty() {
            self.auth.access_token = self.auth.access.clone();
        }
        if self.auth.refresh.is_none() && !self.auth.refresh_token.is_empty() {
            self.auth.refresh = Some(self.auth.refresh_token.clone());
        }
        if self.auth.refresh_token.is_empty() {
            if let Some(refresh) = &self.auth.refresh {
                self.auth.refresh_token = refresh.clone();
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FastWhisperStatus {
    pub installed: bool,
    pub running: bool,
    pub phase: String,
    pub message: String,
    pub error: Option<String>,
    pub last_action: Option<String>,
    pub last_success_at: Option<i64>,
    pub log_line: Option<String>,
    pub install_dir: Option<String>,
    pub updated_at: i64,
}

impl FastWhisperStatus {
    pub fn new(message: &str) -> Self {
        Self {
            installed: false,
            running: false,
            phase: "not-installed".into(),
            message: message.into(),
            error: None,
            last_action: None,
            last_success_at: None,
            log_line: None,
            install_dir: None,
            updated_at: Utc::now().timestamp_millis(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokensPayload {
    pub access: String,
    pub refresh: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AuthDeepLinkPayload {
    Success {
        provider: String,
        tokens: AuthTokensPayload,
        user: Option<Value>,
    },
    Error {
        provider: String,
        error: String,
    },
}
