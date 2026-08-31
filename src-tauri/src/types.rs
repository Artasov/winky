use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::constants::{
    BACKEND_DOMAIN_RU, CURRENT_CONFIG_SCHEMA_VERSION, DEFAULT_BACKEND_DOMAIN, DEFAULT_LLM_MODEL,
    DEFAULT_MIC_ANCHOR, DEFAULT_SPEECH_MODEL,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
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
    pub schema_version: u32,
    #[serde(default)]
    pub storage_revision: u64,
    #[serde(default)]
    pub auth_revision: u64,
    #[serde(default)]
    pub auth: AuthTokens,
    #[serde(default = "default_backend_domain")]
    pub backend_domain: String,
    #[serde(default)]
    pub setup_completed: bool,
    #[serde(default)]
    pub speech: SpeechConfig,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default)]
    pub api_keys: ApiKeys,
    #[serde(default)]
    pub groups: Vec<serde_json::Value>,
    #[serde(default)]
    pub actions: Vec<serde_json::Value>,
    #[serde(default)]
    pub selected_group_id: Option<String>,
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
    #[serde(default = "default_false")]
    pub save_audio_history: bool,
    #[serde(default = "default_false")]
    pub trim_silence_on_actions: bool,
    #[serde(default)]
    pub global_transcribe_prompt: Option<String>,
    #[serde(default)]
    pub global_llm_prompt: Option<String>,
    #[serde(default)]
    pub selected_microphone_id: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_CONFIG_SCHEMA_VERSION,
            storage_revision: 0,
            auth_revision: 0,
            auth: AuthTokens::default(),
            backend_domain: default_backend_domain(),
            setup_completed: false,
            speech: SpeechConfig::default(),
            llm: LlmConfig::default(),
            api_keys: ApiKeys::default(),
            groups: Vec::new(),
            actions: Vec::new(),
            selected_group_id: None,
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
            save_audio_history: default_false(),
            trim_silence_on_actions: default_false(),
            global_transcribe_prompt: None,
            global_llm_prompt: None,
            selected_microphone_id: None,
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

fn default_backend_domain() -> String {
    DEFAULT_BACKEND_DOMAIN.to_string()
}

const API_LLM_MODELS: &[&str] = &[
    "winky-high",
    "winky-mid",
    "winky-low",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
];
const LOCAL_LLM_MODELS: &[&str] = &[
    "gpt-oss:120b",
    "gpt-oss:20b",
    "gemma3:27b",
    "gemma3:12b",
    "gemma3:4b",
    "gemma3:1b",
    "deepseek-r1:8b",
    "qwen3-coder:30b",
    "qwen3:30b",
    "qwen3:8b",
    "qwen3:4b",
];
const API_SPEECH_MODELS: &[&str] = &[
    "winky-transcribe-high",
    "winky-transcribe-low",
    "gpt-4o-mini-transcribe",
    "gpt-4o-transcribe",
    "whisper-1",
    "gemini-3.5-transcribe",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-2.5-flash",
];
const LOCAL_SPEECH_MODELS: &[&str] = &["tiny", "base", "small", "medium", "large-v3"];

impl AppConfig {
    pub fn normalize(&mut self) {
        self.migrate_models();
        self.schema_version = CURRENT_CONFIG_SCHEMA_VERSION;
        if self.backend_domain != DEFAULT_BACKEND_DOMAIN && self.backend_domain != BACKEND_DOMAIN_RU
        {
            self.backend_domain = default_backend_domain();
        }
        if !matches!(self.speech.mode.as_str(), "api" | "local") {
            self.speech.mode = speech_mode_default();
        }
        if !matches!(self.llm.mode.as_str(), "api" | "local") {
            self.llm.mode = llm_mode_default();
        }
        let speech_models = if self.speech.mode == "local" {
            LOCAL_SPEECH_MODELS
        } else {
            API_SPEECH_MODELS
        };
        if !speech_models.contains(&self.speech.model.as_str()) {
            self.speech.model = if self.speech.mode == "local" {
                LOCAL_SPEECH_MODELS[0].to_string()
            } else {
                default_speech_model()
            };
        }
        let llm_models = if self.llm.mode == "local" {
            LOCAL_LLM_MODELS
        } else {
            API_LLM_MODELS
        };
        if !llm_models.contains(&self.llm.model.as_str()) {
            self.llm.model = if self.llm.mode == "local" {
                LOCAL_LLM_MODELS[0].to_string()
            } else {
                default_llm_model()
            };
        }
        if !matches!(
            self.mic_anchor.as_str(),
            "top-left" | "top-right" | "bottom-left" | "bottom-right"
        ) {
            self.mic_anchor = default_mic_anchor();
        }
        if !self.completion_sound_volume.is_finite() {
            self.completion_sound_volume = default_completion_volume();
        }
        self.completion_sound_volume = self.completion_sound_volume.clamp(0.0, 1.0);
        if self.api_keys.openai.trim().is_empty() {
            self.api_keys.openai = String::new();
        }
        if self.api_keys.google.trim().is_empty() {
            self.api_keys.google = String::new();
        }
        if !matches!(self.notes_storage_mode.as_str(), "api" | "local") {
            self.notes_storage_mode = default_notes_storage_mode();
        }
        if self
            .mic_window_position
            .as_ref()
            .is_some_and(|position| !position.x.is_finite() || !position.y.is_finite())
        {
            self.mic_window_position = None;
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

    fn migrate_models(&mut self) {
        self.llm.model = match self.llm.model.as_str() {
            "o4-mini" | "o3-mini" | "o1-mini" | "gpt-4-turbo" | "chatgpt-4o-latest"
            | "gpt-3.5-turbo" => "gpt-5-mini".to_string(),
            "gpt-4.1-nano" => "gpt-5-nano".to_string(),
            "gemini-3.0-flash-preview"
            | "gemini-3.0-flash"
            | "gemini-2.0-flash"
            | "gemini-1.5-flash"
            | "gemini-1.0-pro" => "gemini-3.6-flash".to_string(),
            "gemini-2.0-pro" | "gemini-1.5-pro" => "gemini-2.5-pro".to_string(),
            _ => self.llm.model.clone(),
        };
        self.speech.model = match self.speech.model.as_str() {
            "winky-transcribe" => "winky-transcribe-high".to_string(),
            "gemini-2.0-flash" | "gemini-1.5-flash" => "gemini-3.5-transcribe".to_string(),
            _ => self.speech.model.clone(),
        };
    }
}

#[cfg(test)]
mod config_tests {
    use crate::constants::CURRENT_CONFIG_SCHEMA_VERSION;

    use super::{AppConfig, LlmConfig, SpeechConfig};

    #[test]
    fn reads_legacy_config_without_auth_revision() {
        let config: AppConfig = serde_json::from_value(serde_json::json!({})).unwrap();

        assert_eq!(config.auth_revision, 0);
    }

    #[test]
    fn migrates_retired_models_and_invalid_values() {
        let mut config = AppConfig {
            schema_version: 0,
            llm: LlmConfig {
                model: "gpt-3.5-turbo".to_string(),
                ..LlmConfig::default()
            },
            speech: SpeechConfig {
                model: "winky-transcribe".to_string(),
                ..SpeechConfig::default()
            },
            mic_anchor: "middle".to_string(),
            notes_storage_mode: "remote".to_string(),
            completion_sound_volume: 2.5,
            ..AppConfig::default()
        };

        config.normalize();

        assert_eq!(config.schema_version, CURRENT_CONFIG_SCHEMA_VERSION);
        assert_eq!(config.llm.model, "gpt-5-mini");
        assert_eq!(config.speech.model, "winky-transcribe-high");
        assert_eq!(config.mic_anchor, "bottom-right");
        assert_eq!(config.notes_storage_mode, "api");
        assert_eq!(config.completion_sound_volume, 1.0);
    }

    #[test]
    fn replaces_unknown_and_cross_mode_models() {
        let mut config = AppConfig {
            llm: LlmConfig {
                model: "private-provider-model".to_string(),
                ..LlmConfig::default()
            },
            speech: SpeechConfig {
                mode: "local".to_string(),
                model: "gpt-4o-mini-transcribe".to_string(),
            },
            ..AppConfig::default()
        };

        config.normalize();

        assert_eq!(config.llm.model, "gpt-5-mini");
        assert_eq!(config.speech.model, "tiny");
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
#[serde(rename_all = "camelCase")]
pub struct OAuthExchangeInput {
    pub provider: String,
    pub code: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AuthDeepLinkPayload {
    Code {
        provider: String,
        code: String,
        state: String,
    },
    Error {
        provider: String,
        error: String,
        state: String,
    },
}
