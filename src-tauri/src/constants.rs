#[allow(dead_code)]
pub const APP_NAME: &str = "Winky";
pub const SITE_BASE_URL: &str = "https://xlartas.com";
#[allow(dead_code)]
pub const API_BASE_URL: &str = "https://xlartas.com/api/v1";
#[allow(dead_code)]
pub const API_BASE_URL_FALLBACK_LOCAL: &str = "http://127.0.0.1:8000/api/v1";
pub const FAST_WHISPER_REPO_URL: &str = "https://github.com/Artasov/fast-fast-whisper.git";
pub const FAST_WHISPER_REPO_ARCHIVE_URL: &str =
    "https://github.com/Artasov/fast-fast-whisper/archive/refs/heads/main.zip";
pub const FAST_WHISPER_REPO_NAME: &str = "fast-fast-whisper";
pub const FAST_WHISPER_PORT: u16 = 8868;
pub const FAST_WHISPER_HEALTH_ENDPOINT: &str = "http://127.0.0.1:8868/health";
// A user-level environment variable that points to the shared local server base directory
// (the git repo itself is kept in <value>/fast-fast-whisper). It lets other Winky-based
// apps reuse the same installation without guessing paths.
pub const FAST_WHISPER_INSTALL_ENV_VAR: &str = "WINKY_LOCAL_SPEECH_DIR";
// A small hint file saved near the app config so we can recover the install path
// even if the environment variable was not exported into the current process.
pub const FAST_WHISPER_INSTALL_HINT_FILE: &str = "local-speech-path.txt";
pub const CONFIG_FILE_NAME: &str = "config.json";

pub const DEFAULT_SPEECH_MODEL: &str = "gpt-4o-mini-transcribe";
pub const DEFAULT_LLM_MODEL: &str = "o4-mini";
pub const DEFAULT_MIC_ANCHOR: &str = "bottom-right";

#[allow(dead_code)]
pub const MIC_WINDOW_WIDTH: f64 = 300.0;
#[allow(dead_code)]
pub const MIC_WINDOW_HEIGHT: f64 = 300.0;
#[allow(dead_code)]
pub const MIC_WINDOW_MARGIN: f64 = 24.0;
