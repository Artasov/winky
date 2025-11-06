export const APP_NAME = 'Winky';
export const SITE_BASE_URL = 'https://xldev.ru';
export const API_BASE_URL = 'https://xldev.ru/api/v1';
export const MEDIA_BASE_URL = 'https://xldev.ru';
export const API_BASE_URL_FALLBACK_LOCAL = 'http://127.0.0.1:8000/api/v1';
export const API_BASE_URL_FALLBACKS = [API_BASE_URL, API_BASE_URL_FALLBACK_LOCAL];
export const AUTH_ENDPOINT = `${API_BASE_URL}/auth/login/`;
export const AUTH_REFRESH_ENDPOINT = `${API_BASE_URL}/auth/refresh/`;
export const SPEECH_TRANSCRIBE_ENDPOINT = `${API_BASE_URL}/speech/transcribe`;
export const LLM_PROCESS_ENDPOINT = `${API_BASE_URL}/llm/process`;
export const ACTIONS_ENDPOINT = `${API_BASE_URL}/winky/actions`;
export const ICONS_ENDPOINT = `${API_BASE_URL}/winky/icons`;
export const PROFILE_ENDPOINT = `${API_BASE_URL}/winky/profile`;
export const ME_ENDPOINT = `${API_BASE_URL}/me/`;

export const CONFIG_FILE_NAME = 'config.json';

export const IPC_CHANNELS = {
  AUTH_START_OAUTH: 'auth:start-oauth',
  AUTH_CONSUME_DEEP_LINKS: 'auth:consume-deep-links',
  AUTH_DEEP_LINK: 'auth:deep-link',
} as const;

export const SPEECH_MODES = {
  API: 'api',
  LOCAL: 'local'
} as const;

export const LLM_MODES = {
  API: 'api',
  LOCAL: 'local'
} as const;

export const LLM_API_MODELS = [
  'o4-mini',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o3-mini',
  'o1-mini',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'chatgpt-4o-latest',
  'gpt-3.5-turbo',
  'gpt-5',
  'gpt-5-nano',
  'gpt-5-mini'
] as const;

export const LLM_LOCAL_MODELS = [
  'gpt-oss:120b',
  'gpt-oss:20b',
  'gemma3:27b',
  'gemma3:12b',
  'gemma3:4b',
  'gemma3:1b',
  'deepseek-r1:8b',
  'qwen3-coder:30b',
  'qwen3:30b',
  'qwen3:8b',
  'qwen3:4b'
] as const;

export const SPEECH_API_MODELS = [
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
  'whisper-1'
] as const;

export const SPEECH_LOCAL_MODELS = [
  'tiny',
  'base',
  'small',
  'medium',
  'large',
  'large-v2',
  'large-v3'
] as const;
