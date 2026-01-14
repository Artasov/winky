export const APP_NAME = 'Winky';
export const API_BASE_URL = 'https://xlartas.com/api/v1';
export const AUTH_ENDPOINT = `${API_BASE_URL}/auth/login/`;
export const AUTH_REFRESH_ENDPOINT = `${API_BASE_URL}/auth/refresh/`;
export const ME_ENDPOINT = `${API_BASE_URL}/me/`;
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

export const LLM_API_MODELS = [
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

export const SPEECH_API_MODELS = [
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

export const MIC_WINDOW_WIDTH = 300;
export const MIC_WINDOW_HEIGHT = 300;
export const MIC_WINDOW_MARGIN = 24;
