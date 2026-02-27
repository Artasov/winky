export const APP_NAME = 'Winky';
export const BACKEND_DOMAINS = ['xlartas.com', 'xlartas.ru'] as const;
export type BackendDomain = (typeof BACKEND_DOMAINS)[number];
export const DEFAULT_BACKEND_DOMAIN: BackendDomain = 'xlartas.com';

const BACKEND_DOMAIN_STORAGE_KEY = 'winky.backend.domain';

const resolveBackendDomain = (domain: string | null | undefined): BackendDomain =>
    domain === 'xlartas.ru' ? 'xlartas.ru' : DEFAULT_BACKEND_DOMAIN;

const readStoredBackendDomain = (): BackendDomain => {
    if (typeof window === 'undefined') return DEFAULT_BACKEND_DOMAIN;
    try {
        return resolveBackendDomain(window.localStorage?.getItem(BACKEND_DOMAIN_STORAGE_KEY));
    } catch {
        return DEFAULT_BACKEND_DOMAIN;
    }
};

const persistBackendDomain = (domain: BackendDomain): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage?.setItem(BACKEND_DOMAIN_STORAGE_KEY, domain);
    } catch {
        // Ignore persistence failures (private mode, blocked storage).
    }
};

let currentBackendDomain: BackendDomain = readStoredBackendDomain();

export let SITE_BASE_URL = `https://${currentBackendDomain}`;
export let WS_BASE_URL = `wss://${currentBackendDomain}`;
export let API_BASE_URL = `${SITE_BASE_URL}/api/v1`;
export let AUTH_ENDPOINT = `${API_BASE_URL}/auth/login/`;
export let AUTH_REFRESH_ENDPOINT = `${API_BASE_URL}/auth/refresh/`;
export let ME_ENDPOINT = `${API_BASE_URL}/me/`;

const syncBaseUrls = (): void => {
    SITE_BASE_URL = `https://${currentBackendDomain}`;
    WS_BASE_URL = `wss://${currentBackendDomain}`;
    API_BASE_URL = `${SITE_BASE_URL}/api/v1`;
    AUTH_ENDPOINT = `${API_BASE_URL}/auth/login/`;
    AUTH_REFRESH_ENDPOINT = `${API_BASE_URL}/auth/refresh/`;
    ME_ENDPOINT = `${API_BASE_URL}/me/`;
};

export const getBackendDomain = (): BackendDomain => currentBackendDomain;

export const setBackendDomain = (domain: string | null | undefined): BackendDomain => {
    const resolved = resolveBackendDomain(domain);
    currentBackendDomain = resolved;
    persistBackendDomain(resolved);
    syncBaseUrls();
    return resolved;
};

export const getSiteBaseUrl = (domain?: string | null): string => `https://${resolveBackendDomain(domain ?? currentBackendDomain)}`;
export const getWsBaseUrl = (domain?: string | null): string => `wss://${resolveBackendDomain(domain ?? currentBackendDomain)}`;
export const getApiBaseUrl = (domain?: string | null): string => `${getSiteBaseUrl(domain)}/api/v1`;
export const getAuthEndpoint = (domain?: string | null): string => `${getApiBaseUrl(domain)}/auth/login/`;
export const getAuthRefreshEndpoint = (domain?: string | null): string => `${getApiBaseUrl(domain)}/auth/refresh/`;
export const getMeEndpoint = (domain?: string | null): string => `${getApiBaseUrl(domain)}/me/`;
export const FAST_WHISPER_PORT = 8868;
export const FAST_WHISPER_BASE_URL = `http://127.0.0.1:${FAST_WHISPER_PORT}`;
export const FAST_WHISPER_TRANSCRIBE_ENDPOINT = `${FAST_WHISPER_BASE_URL}/v1/audio/transcriptions`;
export const FAST_WHISPER_TRANSCRIBE_TIMEOUT = 600_000; // 10 минут

export const SPEECH_MODES = {
    API: 'api',
    LOCAL: 'local'
} as const;

export const LLM_MODES = {
    API: 'api',
    LOCAL: 'local'
} as const;

export const LLM_OPENAI_API_MODELS = [
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
    'gpt-5-mini',
    'gpt-5-nano',
] as const;

export const LLM_GEMINI_API_MODELS = [
    'gemini-2.5-flash',
    'gemini-3.0-pro',
    'gemini-3.0-flash',
    'gemini-2.5-pro',
    'gemini-2.0-pro',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro'
] as const;

export const LLM_WINKY_API_MODELS = ['winky-high', 'winky-mid', 'winky-low'] as const;

export const LLM_API_MODELS = [
    ...LLM_WINKY_API_MODELS,
    ...LLM_OPENAI_API_MODELS,
    ...LLM_GEMINI_API_MODELS
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

export const SPEECH_OPENAI_API_MODELS = [
    'gpt-4o-mini-transcribe',
    'gpt-4o-transcribe',
    'whisper-1'
] as const;

// Google Gemini API модели для транскрибации (бесплатные квоты)
// Gemini может обрабатывать аудио через generateContent API с inlineData
// Бесплатные квоты: до 10 минут аудио, до 5 запросов в день
// Поддерживаемые форматы: WAV, MP3, AIFF, AAC, OGG Vorbis, FLAC
// Максимальная длина аудио в одном запросе: 9.5 часов
export const SPEECH_GOOGLE_API_MODELS = [
    'gemini-2.5-flash',  // Последняя версия Flash, поддерживает аудио
    'gemini-2.0-flash'   // Flash модель, поддерживает аудио
] as const;

export const SPEECH_WINKY_API_MODELS = ['winky-transcribe'] as const;

export const SPEECH_API_MODELS = [
    ...SPEECH_WINKY_API_MODELS,
    ...SPEECH_OPENAI_API_MODELS,
    ...SPEECH_GOOGLE_API_MODELS
] as const;

export const SPEECH_LOCAL_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3'] as const;

export const SPEECH_LOCAL_MODEL_DETAILS = {
    tiny: {label: 'Tiny', size: '75MB'},
    base: {label: 'Base', size: '141MB'},
    small: {label: 'Small', size: '463MB'},
    medium: {label: 'Medium', size: '1.42GB'},
    'large-v3': {label: 'Large', size: '3GB'}
} as const;

export const SPEECH_LOCAL_MODEL_ALIASES = {
    large: 'large-v3',
    'large-v2': 'large-v3'
} as const;

export const MIC_WINDOW_WIDTH = 520;
export const MIC_WINDOW_HEIGHT = 1080;
export const MIC_WINDOW_MARGIN = 24;

export const MAX_ACTIONS_PER_GROUP = 6;
export const MAX_ACTIONS_AROUND_MIC = 7;
export const SYSTEM_GROUP_ID = '00000000-0000-0000-0000-000000000000';

export const getMediaUrl = (path: string | undefined | null): string | undefined => {
    if (!path) return undefined;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${getSiteBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
};
