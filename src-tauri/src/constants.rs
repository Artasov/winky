pub const APP_NAME: &str = "Winky";
pub const SITE_BASE_URL: &str = "https://xldev.ru";
pub const API_BASE_URL: &str = "https://xldev.ru/api/v1";
pub const API_BASE_URL_FALLBACK_LOCAL: &str = "http://127.0.0.1:8000/api/v1";
pub const FAST_WHISPER_REPO_URL: &str = "https://github.com/Artasov/fast-fast-whisper.git";
pub const FAST_WHISPER_REPO_ARCHIVE_URL: &str =
    "https://github.com/Artasov/fast-fast-whisper/archive/refs/heads/main.zip";
pub const FAST_WHISPER_REPO_NAME: &str = "fast-fast-whisper";
pub const FAST_WHISPER_PORT: u16 = 8868;
pub const FAST_WHISPER_HEALTH_ENDPOINT: &str = "http://127.0.0.1:8868/health";
pub const CONFIG_FILE_NAME: &str = "config.json";

pub const DEFAULT_SPEECH_MODEL: &str = "gpt-4o-mini-transcribe";
pub const DEFAULT_LLM_MODEL: &str = "o4-mini";
pub const DEFAULT_MIC_ANCHOR: &str = "bottom-right";

pub const MIC_WINDOW_WIDTH: f64 = 300.0;
pub const MIC_WINDOW_HEIGHT: f64 = 300.0;
pub const MIC_WINDOW_MARGIN: f64 = 24.0;
