export const APP_NAME = 'Winky';
export const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';
export const API_BASE_URL_IPV4 = 'http://127.0.0.1:8000/api/v1';
export const API_BASE_URL_IPV6 = 'http://[::1]:8000/api/v1';
export const API_BASE_URL_FALLBACKS = [API_BASE_URL, API_BASE_URL_IPV4, API_BASE_URL_IPV6];
export const AUTH_ENDPOINT = `${API_BASE_URL}/auth/login/`;
export const SPEECH_TRANSCRIBE_ENDPOINT = `${API_BASE_URL}/speech/transcribe`;
export const LLM_PROCESS_ENDPOINT = `${API_BASE_URL}/llm/process`;
export const ACTIONS_ENDPOINT = `${API_BASE_URL}/winky/actions`;
export const ACTIONS_CREATE_ENDPOINT = `${ACTIONS_ENDPOINT}/create`;

export const CONFIG_FILE_NAME = 'config.json';

export const SPEECH_MODES = {
  API: 'api',
  LOCAL: 'local'
} as const;

export const LLM_MODES = {
  API: 'api',
  LOCAL: 'local'
} as const;
