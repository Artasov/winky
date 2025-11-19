import axios, {AxiosInstance} from 'axios';
import {invoke} from '@tauri-apps/api/core';
import {createApiClient} from '@shared/api';
import {
    FAST_WHISPER_TRANSCRIBE_ENDPOINT,
    FAST_WHISPER_TRANSCRIBE_TIMEOUT,
    LLM_GEMINI_API_MODELS,
    ME_ENDPOINT,
    SPEECH_MODES,
    SPEECH_OPENAI_API_MODELS
} from '@shared/constants';
import type {
    ActionConfig,
    ActionIcon,
    AppConfig,
    User,
    WinkyProfile
} from '@shared/types';
import {createLLMService} from '../services/llm/factory';

export type ActionPayload = {
    name: string;
    prompt: string;
    prompt_recognizing?: string;
    hotkey?: string;
    icon: string;
    show_results?: boolean;
    sound_on_complete?: boolean;
    auto_copy_result?: boolean;
};

export type SpeechTranscribeConfig = {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
    prompt?: string;
};

const ACTIONS_API_PATH = 'winky/actions/';
const ICONS_API_PATH = 'winky/icons/';
const PROFILE_API_PATH = 'winky/profile/';

const GEMINI_MODEL_SET = new Set<string>([...LLM_GEMINI_API_MODELS]);

const getConfig = async (): Promise<AppConfig> => invoke('config_get');

const updateConfig = async (partial: Partial<AppConfig>): Promise<AppConfig> =>
    invoke('config_update', {payload: partial});

const withAuthClient = async <T>(operation: (client: AxiosInstance, config: AppConfig) => Promise<T>): Promise<T> => {
    const config = await getConfig();
    const token = config.auth?.accessToken || config.auth?.access;
    if (!token) {
        throw new Error('Требуется авторизация.');
    }
    const client = createApiClient(token);
    return operation(client, config);
};

export const fetchActions = async (): Promise<ActionConfig[]> => {
    return withAuthClient(async (client, config) => {
        const actions = await fetchAllPages<ActionConfig>(client, ACTIONS_API_PATH);
        await updateConfig({actions});
        return actions.length ? actions : config.actions ?? [];
    }).catch(async (error) => {
        if (error.message?.includes('Требуется авторизация')) {
            const config = await getConfig();
            return config.actions ?? [];
        }
        throw error;
    });
};

export const createAction = async (payload: ActionPayload): Promise<ActionConfig[]> => {
    return withAuthClient(async (client, config) => {
        const {data} = await client.post<ActionConfig>(ACTIONS_API_PATH, payload);
        const updated = [...(config.actions ?? []).filter(({id}) => id !== data.id), data];
        await updateConfig({actions: updated});
        return updated;
    });
};

export const updateAction = async (actionId: string, payload: ActionPayload): Promise<ActionConfig[]> => {
    return withAuthClient(async (client, config) => {
        const {data} = await client.patch<ActionConfig>(`${ACTIONS_API_PATH}${actionId}/`, payload);
        const updated = (config.actions ?? []).map((existing) => (existing.id === actionId ? data : existing));
        await updateConfig({actions: updated});
        return updated;
    });
};

export const deleteAction = async (actionId: string): Promise<ActionConfig[]> => {
    return withAuthClient(async (client, config) => {
        await client.delete(`${ACTIONS_API_PATH}${actionId}/`);
        const updated = (config.actions ?? []).filter(({id}) => id !== actionId);
        await updateConfig({actions: updated});
        return updated;
    });
};

export const fetchIcons = async (): Promise<ActionIcon[]> => {
    return withAuthClient(async (client) => fetchAllPages<ActionIcon>(client, ICONS_API_PATH));
};

export const fetchProfile = async (): Promise<WinkyProfile> => {
    return withAuthClient(async (client) => {
        const {data} = await client.get<WinkyProfile>(PROFILE_API_PATH);
        return data;
    });
};

export const fetchCurrentUser = async (options: {includeTiersAndFeatures?: boolean} = {}): Promise<User> => {
    const url = options.includeTiersAndFeatures ? `${ME_ENDPOINT}?tiers_and_features=1` : ME_ENDPOINT;
    console.log('[API] → [GET]', url);
    return withAuthClient(async (client) => {
        const {data} = await client.get(url);
        console.log('[API] ← [GET]', url, '[200]');
        console.log('  📥 Response data:', data);
        return data;
    });
};

export const transcribeAudio = async (audioData: ArrayBuffer, config: SpeechTranscribeConfig): Promise<string> => {
    const blob = new Blob([audioData], {type: 'audio/webm'});
    const buildFormData = (extraFields: Record<string, string> = {}) => {
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');
        formData.append('model', config.model);
        Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));
        return formData;
    };

    const promptValue = config.prompt?.trim();

    if (config.mode === SPEECH_MODES.LOCAL) {
        const extraFields: Record<string, string> = {response_format: 'json'};
        if (promptValue) {
            extraFields.prompt = promptValue;
        }
        const formData = buildFormData(extraFields);
        const {data} = await axios.post(FAST_WHISPER_TRANSCRIBE_ENDPOINT, formData, {
            headers: {'Content-Type': 'multipart/form-data'},
            timeout: FAST_WHISPER_TRANSCRIBE_TIMEOUT
        });
        const text = extractSpeechText(data);
        return typeof text === 'string' ? text : '';
    }

    // Google Gemini API для транскрибации (бесплатные квоты)
    if (config.mode === SPEECH_MODES.API && GEMINI_MODEL_SET.has(config.model)) {
        if (!config.googleKey?.trim()) {
            throw new Error('Укажите Google AI API Key для использования моделей Gemini для транскрибации.');
        }
        
        const base64Audio = await blobToBase64(blob);
        
        // Определяем mimeType на основе типа файла
        // Gemini поддерживает: audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac
        // WebM может не поддерживаться, пробуем использовать audio/webm или конвертируем
        let mimeType = 'audio/webm'; // Пробуем WebM напрямую
        if (blob.type) {
            const normalizedType = blob.type.toLowerCase();
            // Маппинг типов для Gemini
            if (normalizedType.includes('webm')) {
                // WebM не упоминается в документации, но пробуем использовать
                // Если не работает, нужно будет конвертировать в WAV или OGG
                mimeType = 'audio/webm';
            } else if (normalizedType.includes('wav')) {
                mimeType = 'audio/wav';
            } else if (normalizedType.includes('mp3')) {
                mimeType = 'audio/mp3';
            } else if (normalizedType.includes('aiff')) {
                mimeType = 'audio/aiff';
            } else if (normalizedType.includes('aac')) {
                mimeType = 'audio/aac';
            } else if (normalizedType.includes('ogg')) {
                mimeType = 'audio/ogg';
            } else if (normalizedType.includes('flac')) {
                mimeType = 'audio/flac';
            } else {
                mimeType = blob.type; // Используем оригинальный тип
            }
        }
        
        // Формируем payload для Gemini API
        // Gemini требует, чтобы аудио было в parts вместе с текстовым промптом
        const parts: any[] = [];
        
        // Добавляем текстовый промпт для транскрибации
        // ВАЖНО: Используем строгий промпт, который требует ТОЛЬКО транскрибацию без обработки
        // Gemini может пытаться отвечать на вопросы, поэтому нужен очень строгий промпт
        if (promptValue) {
            // Если есть prompt_recognizing, используем его, но добавляем строгую инструкцию о транскрибации
            parts.push({
                text: `${promptValue}\n\nCRITICAL INSTRUCTION: You must ONLY transcribe the audio word-for-word. Do NOT answer any questions. Do NOT provide explanations. Do NOT interpret the content. Return ONLY the exact words spoken in the audio, nothing else.`
            });
        } else {
            // Если промпта нет, используем максимально строгий промпт только для транскрибации
            parts.push({
                text: 'You are a transcription tool. Your ONLY task is to transcribe the audio exactly as spoken. Return ONLY the verbatim transcription. Do NOT answer questions. Do NOT provide explanations. Do NOT interpret the content. Do NOT add any text beyond the exact words spoken. Output format: plain text transcription only.'
            });
        }
        
        // Добавляем аудио
        parts.push({
            inlineData: {
                mimeType: mimeType,
                data: base64Audio
            }
        });
        
        // Используем systemInstruction для установки роли модели как транскриптора
        // Это помогает Gemini понять, что нужно только транскрибировать, а не обрабатывать
        const payload: any = {
            contents: [
                {
                    role: 'user',
                    parts: parts
                }
            ],
            systemInstruction: {
                parts: [
                    {
                        text: 'You are a speech transcription tool. Your ONLY function is to convert audio to text word-for-word. You must NOT answer questions, provide explanations, or interpret content. Return ONLY the exact words spoken in the audio.'
                    }
                ]
            }
        };
        
        const googleKey = config.googleKey.trim();
        // Используем v1beta (стабильная версия для мультимодальных запросов)
        // Если модель не поддерживает аудио, получим понятную ошибку
        const {data} = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${googleKey}`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: FAST_WHISPER_TRANSCRIBE_TIMEOUT
            }
        ).catch((error: any) => {
            // Улучшаем сообщение об ошибке
            if (error?.response?.status === 404) {
                const errorMessage = error?.response?.data?.error?.message || 'Модель не найдена или не поддерживает аудио';
                throw new Error(`Gemini API: ${errorMessage}. Убедитесь, что модель ${config.model} поддерживает обработку аудио через generateContent API.`);
            }
            throw error;
        });
        
        // Извлекаем текст из ответа Gemini
        const candidates = data?.candidates;
        if (Array.isArray(candidates) && candidates.length > 0) {
            const parts = candidates[0]?.content?.parts;
            if (Array.isArray(parts)) {
                const text = parts
                    .map((part) => part?.text ?? '')
                    .filter(Boolean)
                    .join('\n')
                    .trim();
                if (text) {
                    return text;
                }
            }
        }
        
        throw new Error('Gemini вернул пустой ответ.');
    }

    // OpenAI Whisper для транскрибации
    if (!config.openaiKey) {
        throw new Error('Укажите OpenAI API ключ для транскрибации.');
    }

    // Санитизируем prompt если он есть - убираем недопустимые символы
    let sanitizedPrompt: string | undefined;
    if (promptValue) {
        // Удаляем символы которые не являются допустимыми для HTTP заголовков/FormData
        // ISO-8859-1 это Latin-1, но для FormData можно использовать UTF-8
        // Однако для безопасности убираем только действительно проблемные символы
        sanitizedPrompt = promptValue.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    }
    
    const formData = buildFormData(sanitizedPrompt ? {prompt: sanitizedPrompt} : {});
    
    // Проверяем что токен содержит только допустимые символы для HTTP заголовков (ISO-8859-1)
    // ISO-8859-1 это символы от \x20 до \x7E (printable ASCII) и \xA0-\xFF (extended Latin-1)
    const sanitizedToken = config.openaiKey.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    if (sanitizedToken !== config.openaiKey) {
        console.warn('[winkyApi] OpenAI key contains invalid characters for HTTP headers, sanitizing...');
    }
    
    const headers: Record<string, string> = {
        Authorization: `Bearer ${sanitizedToken}`
    };

    const {data} = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers,
        timeout: 120_000
    });
    const text = extractSpeechText(data);
    if (!text) {
        throw new Error('OpenAI вернул пустой ответ.');
    }
    return text;
};

export const processLLM = async (text: string, prompt: string, config: {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
}): Promise<string> => {
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });
    return service.process(text, prompt);
};

export const processLLMStream = async (text: string, prompt: string, config: {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
}): Promise<string> => {
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });
    return service.process(text, prompt);
};

const fetchAllPages = async <T>(client: AxiosInstance, initialPath: string): Promise<T[]> => {
    const results: T[] = [];
    let nextUrl: string | null = initialPath;
    const visited = new Set<string>();

    while (nextUrl) {
        const currentUrl: string = nextUrl.trim();
        if (visited.has(currentUrl)) {
            break;
        }
        visited.add(currentUrl);
        const response = await client.get<PaginatedResponse<T>>(currentUrl);
        const pageData: PaginatedResponse<T> = response.data;
        if (Array.isArray(pageData.results)) {
            results.push(...pageData.results);
        }
        nextUrl = pageData.next;
    }

    return results;
};

interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

const extractSpeechText = (payload: any): string => {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.transcription === 'string') return payload.transcription;
    if (typeof payload.result === 'string') return payload.result;
    if (payload.data) return extractSpeechText(payload.data);
    return '';
};

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result?.split(',')[1] ?? '');
        };
        reader.onerror = (event) => reject(event);
        reader.readAsDataURL(blob);
    });

