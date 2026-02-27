import axios, {AxiosInstance} from 'axios';
import {invoke} from '@tauri-apps/api/core';
import {createApiClient} from '@shared/api';
import {
    FAST_WHISPER_TRANSCRIBE_ENDPOINT,
    FAST_WHISPER_TRANSCRIBE_TIMEOUT,
    LLM_GEMINI_API_MODELS,
    SPEECH_MODES
} from '@shared/constants';
import type {ActionConfig, ActionGroup, ActionIcon, AppConfig, User, WinkyNote, WinkyProfile} from '@shared/types';
import {createLLMService} from '../services/llm/factory';
import {markLocalTranscriptionFinish, markLocalTranscriptionStart} from './localSpeechModels';

export type ActionCreatePayload = {
    name: string;
    prompt: string;
    prompt_recognizing?: string;
    hotkey?: string;
    icon: string;
    priority?: number;
    show_results?: boolean;
    sound_on_complete?: boolean;
    auto_copy_result?: boolean;
};

export type ActionUpdatePayload = {
    name?: string;
    prompt?: string;
    prompt_recognizing?: string;
    hotkey?: string;
    icon?: string;
    priority?: number;
    show_results?: boolean;
    sound_on_complete?: boolean;
    auto_copy_result?: boolean;
};

export type GroupCreatePayload = {
    name: string;
    description?: string;
    color?: string;
    icon: string;
    priority?: number;
};

export type GroupUpdatePayload = {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    priority?: number;
};

export type SpeechTranscribeConfig = {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
    prompt?: string;
};

export type SpeechTranscribeOptions = {
    signal?: AbortSignal;
    uiTimeoutMs?: number;
    mimeType?: string;
    fileName?: string;
};

const DEFAULT_TRANSCRIBE_UI_TIMEOUT_MS = 120_000;
const SLOW_TRANSCRIBE_WARNING_MS = 15_000;

const ACTIONS_API_PATH = 'winky/actions/';
const GROUPS_API_PATH = 'winky/groups/';
const ICONS_API_PATH = 'winky/icons/';
const PROFILE_API_PATH = 'winky/profile/';
const NOTES_API_PATH = 'winky/notes/';

const GEMINI_MODEL_SET = new Set<string>([...LLM_GEMINI_API_MODELS]);

const getConfig = async (): Promise<AppConfig> => invoke('config_get');

const updateConfig = async (partial: Partial<AppConfig>): Promise<AppConfig> =>
    invoke('config_update', {payload: partial});

const withAuthClient = async <T>(operation: (client: AxiosInstance, config: AppConfig) => Promise<T>): Promise<T> => {
    const config = await getConfig();
    const token = config.auth?.accessToken || config.auth?.access;
    if (!token) {
        throw new Error('Authentication is required.');
    }
    const client = createApiClient(token, undefined, config.backendDomain);
    return operation(client, config);
};

export const createAction = async (payload: ActionCreatePayload): Promise<ActionConfig[]> => {
    return withAuthClient(async (client) => {
        await client.post<ActionConfig>(ACTIONS_API_PATH, payload);
        // Перезагружаем группы, чтобы получить актуальные данные
        const groups = await fetchAllPages<ActionGroup>(client, GROUPS_API_PATH);
        const allActions = groups.flatMap((group) => group.actions);
        const uniqueActions = Array.from(new Map(allActions.map((a) => [a.id, a])).values());
        await updateConfig({groups, actions: uniqueActions});
        return uniqueActions;
    });
};

export const updateAction = async (actionId: string, payload: ActionUpdatePayload): Promise<ActionConfig[]> => {
    return withAuthClient(async (client) => {
        await client.patch<ActionConfig>(`${ACTIONS_API_PATH}${actionId}/`, payload);
        // Перезагружаем группы, чтобы получить актуальные данные
        const groups = await fetchAllPages<ActionGroup>(client, GROUPS_API_PATH);
        const allActions = groups.flatMap((group) => group.actions);
        const uniqueActions = Array.from(new Map(allActions.map((a) => [a.id, a])).values());
        await updateConfig({groups, actions: uniqueActions});
        return uniqueActions;
    });
};

export const deleteAction = async (actionId: string): Promise<ActionConfig[]> => {
    return withAuthClient(async (client) => {
        await client.delete(`${ACTIONS_API_PATH}${actionId}/`);
        // Перезагружаем группы, чтобы получить актуальные данные
        const groups = await fetchAllPages<ActionGroup>(client, GROUPS_API_PATH);
        const allActions = groups.flatMap((group) => group.actions);
        const uniqueActions = Array.from(new Map(allActions.map((a) => [a.id, a])).values());
        await updateConfig({groups, actions: uniqueActions});
        return uniqueActions;
    });
};

// Groups API

export const fetchGroups = async (): Promise<ActionGroup[]> => {
    return withAuthClient(async (client, config) => {
        const groups = await fetchAllPages<ActionGroup>(client, GROUPS_API_PATH);
        // Извлекаем все экшены из групп для обратной совместимости
        const allActions = groups.flatMap((group) => group.actions);
        // Убираем дубликаты по id
        const uniqueActions = Array.from(new Map(allActions.map((a) => [a.id, a])).values());
        await updateConfig({groups, actions: uniqueActions});
        return groups;
    }).catch(async (error) => {
        if (error.message?.includes('Authentication is required')) {
            const config = await getConfig();
            return config.groups ?? [];
        }
        throw error;
    });
};

export const createGroup = async (payload: GroupCreatePayload): Promise<ActionGroup[]> => {
    return withAuthClient(async (client) => {
        await client.post<ActionGroup>(GROUPS_API_PATH, payload);
        return fetchGroups();
    });
};

export const updateGroup = async (groupId: string, payload: GroupUpdatePayload): Promise<ActionGroup[]> => {
    return withAuthClient(async (client) => {
        await client.patch<ActionGroup>(`${GROUPS_API_PATH}${groupId}/`, payload);
        return fetchGroups();
    });
};

export const deleteGroup = async (groupId: string): Promise<ActionGroup[]> => {
    return withAuthClient(async (client) => {
        await client.delete(`${GROUPS_API_PATH}${groupId}/`);
        return fetchGroups();
    });
};

export const addActionToGroup = async (groupId: string, actionId: string): Promise<ActionGroup[]> => {
    return withAuthClient(async (client) => {
        await client.post(`${GROUPS_API_PATH}${groupId}/add-action/`, {action_id: actionId});
        return fetchGroups();
    });
};

export const removeActionFromGroup = async (groupId: string, actionId: string): Promise<ActionGroup[]> => {
    return withAuthClient(async (client) => {
        await client.post(`${GROUPS_API_PATH}${groupId}/remove-action/`, {action_id: actionId});
        return fetchGroups();
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

export type NotesListResponse = {
    count: number;
    next: string | null;
    previous: string | null;
    results: WinkyNote[];
};

export const fetchNotesPage = async (page: number = 1, pageSize: number = 20): Promise<NotesListResponse> => {
    return withAuthClient(async (client) => {
        const {data} = await client.get<NotesListResponse>(NOTES_API_PATH, {
            params: {
                page,
                page_size: pageSize
            }
        });
        return data;
    });
};

export const createNote = async (payload: {title: string; description?: string; x_username?: string}): Promise<WinkyNote> => {
    return withAuthClient(async (client) => {
        const {data} = await client.post<WinkyNote>(NOTES_API_PATH, payload);
        return data;
    });
};

export const updateNote = async (
    noteId: string,
    payload: {title?: string; description?: string; x_username?: string}
): Promise<WinkyNote> => {
    return withAuthClient(async (client) => {
        const {data} = await client.patch<WinkyNote>(`${NOTES_API_PATH}${noteId}/`, payload);
        return data;
    });
};

export const deleteNote = async (noteId: string): Promise<void> => {
    return withAuthClient(async (client) => {
        await client.delete(`${NOTES_API_PATH}${noteId}/`);
    });
};

export const bulkDeleteNotes = async (ids: string[]): Promise<number> => {
    return withAuthClient(async (client) => {
        const {data} = await client.post<{deleted_count: number}>(`${NOTES_API_PATH}bulk-delete/`, {ids});
        return data.deleted_count ?? 0;
    });
};

export const transcribeAudio = async (
    audioData: ArrayBuffer,
    config: SpeechTranscribeConfig,
    options: SpeechTranscribeOptions = {}
): Promise<string> => {
    const resolvedMimeType = options.mimeType || 'audio/webm';
    const resolvedFileName = options.fileName
        || (resolvedMimeType.includes('wav') ? 'audio.wav' : 'audio.webm');
    const blob = new Blob([audioData], {type: resolvedMimeType});
    const buildFormData = (extraFields: Record<string, string> = {}) => {
        const formData = new FormData();
        formData.append('file', blob, resolvedFileName);
        formData.append('model', config.model);
        Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));
        return formData;
    };

    const promptValue = config.prompt?.trim();
    const audioSizeKB = (audioData.byteLength / 1024).toFixed(2);
    const controller = new AbortController();
    const {signal, uiTimeoutMs} = options;
    let clearExternalAbort: (() => void) | null = null;
    if (signal) {
        const forwardAbort = () => controller.abort(signal.reason);
        if (signal.aborted) {
            forwardAbort();
        } else {
            signal.addEventListener('abort', forwardAbort, {once: true});
            clearExternalAbort = () => signal.removeEventListener('abort', forwardAbort);
        }
    }
    const timeoutMs = Math.max(5_000, uiTimeoutMs ?? DEFAULT_TRANSCRIBE_UI_TIMEOUT_MS);
    const timeoutId = setTimeout(() => {
        if (!controller.signal.aborted) {
            controller.abort(new DOMException('Transcription request timed out.', 'AbortError'));
        }
    }, timeoutMs);
    const slowWarnId = setTimeout(() => {
        console.warn('[Transcribe] UI still waiting for response…', {
            model: config.model,
            mode: config.mode,
            timeoutMs
        });
    }, Math.min(SLOW_TRANSCRIBE_WARNING_MS, timeoutMs - 1_000));

    try {
    if (config.mode === SPEECH_MODES.LOCAL) {
        console.log(`%cTranscribe → %c[LOCAL] %c${config.model}`, 
            'color: #10b981; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6'
        );
        console.log('  📤 Request:', {
            model: config.model,
            audioSize: `${audioSizeKB} KB`,
            prompt: promptValue || '(none)'
        });
        const extraFields: Record<string, string> = {response_format: 'json'};
        if (promptValue) {
            extraFields.prompt = promptValue;
        }
        const formData = buildFormData(extraFields);
        let transcriptionToken: number | null = null;
        try {
            transcriptionToken = markLocalTranscriptionStart();
            const {data} = await axios.post(FAST_WHISPER_TRANSCRIBE_ENDPOINT, formData, {
                headers: {'Content-Type': 'multipart/form-data'},
                timeout: FAST_WHISPER_TRANSCRIBE_TIMEOUT,
                signal: controller.signal
            });
            const result = extractSpeechText(data);
            console.log(`%cTranscribe ← %c[LOCAL] %c${config.model} %c[200]`, 
                'color: #10b981; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #22c55e; font-weight: bold'
            );
            console.log('  📥 Response:', {
                transcription: result,
                length: result.length
            });
            return result;
        } catch (error: any) {
            const wasAborted = controller.signal.aborted;
            const errorCode = error?.code || 'UNKNOWN';
            const errorStatus = error?.response?.status;
            const errorMessage = error?.message || 'Unknown error';
            
            console.error(`%cTranscribe ← %c[LOCAL] %c${config.model} %c[ERROR]`, 
                'color: #ef4444; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #ef4444; font-weight: bold'
            );
            console.error('  ❌ Error details:', {
                code: errorCode,
                status: errorStatus,
                message: errorMessage,
                wasAborted,
                isNetworkError: axios.isAxiosError(error) && !error.response,
                isTimeout: errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT'
            });
            
            if (wasAborted) {
                console.warn('[Transcribe] LOCAL request aborted or timed out.', {model: config.model});
                throw new Error('Transcription request was cancelled or timed out.');
            }
            
            // Сетевые ошибки (ECONNRESET, ECONNREFUSED и др.)
            if (axios.isAxiosError(error) && !error.response) {
                throw new Error(`Network error during transcription: ${errorMessage}`);
            }
            
            throw error;
        } finally {
            if (transcriptionToken !== null) {
                markLocalTranscriptionFinish(transcriptionToken);
            }
        }
    }

    // Google Gemini API для транскрибации (бесплатные квоты)
    if (config.mode === SPEECH_MODES.API && GEMINI_MODEL_SET.has(config.model)) {
        if (!config.googleKey?.trim()) {
            throw new Error('Provide a Google AI API key to use Gemini models for transcription.');
        }
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
        console.log(`%cTranscribe → %c[Google Gemini] %c${config.model}`, 
            'color: #10b981; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6'
        );
        
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
        const fullUrl = `${url}?key=${googleKey.substring(0, 10)}...`;
        
        console.log('  📤 Request:', {
            url: fullUrl,
            model: config.model,
            audioSize: `${audioSizeKB} KB`,
            mimeType: mimeType,
            prompt: promptValue || '(transcription only)',
            systemInstruction: payload.systemInstruction?.parts?.[0]?.text || '(none)',
            payload: payload
        });
        
        // Используем v1beta (стабильная версия для мультимодальных запросов)
        // Если модель не поддерживает аудио, получим понятную ошибку
        try {
            const {data} = await axios.post(
                `${url}?key=${googleKey}`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: FAST_WHISPER_TRANSCRIBE_TIMEOUT,
                    signal: controller.signal
                }
            );
            
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
                        console.log(`%cTranscribe ← %c[Google Gemini] %c${config.model} %c[200]`, 
                            'color: #10b981; font-weight: bold',
                            'color: #3b82f6; font-weight: bold',
                            'color: #8b5cf6',
                            'color: #22c55e; font-weight: bold'
                        );
                        console.log('  📥 Response:', {
                            transcription: text,
                            length: text.length,
                            fullResponse: data
                        });
                        return text;
                    }
                }
            }
        } catch (error: any) {
            if (controller.signal.aborted) {
                console.warn('[Transcribe] Gemini request aborted or timed out.', {model: config.model});
                throw new Error('Transcription request was cancelled or timed out.');
            }
            const status = error?.response?.status || 'ERROR';
            console.error(`%cTranscribe ← %c[Google Gemini] %c${config.model} %c[${status}]`, 
                'color: #ef4444; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #ef4444; font-weight: bold'
            );
            if (error?.response?.data) {
                console.error('  ❌ Error data:', error.response.data);
            } else {
                console.error('  ❌ Error:', error.message);
            }
            // Улучшаем сообщение об ошибке
            if (error?.response?.status === 404) {
                const errorMessage =
                    error?.response?.data?.error?.message ||
                    'The model was not found or does not support audio.';
                throw new Error(
                    `Gemini API: ${errorMessage}. Make sure the ${config.model} model supports audio via the generateContent API.`
                );
            }
            throw error;
        }
        throw new Error('Gemini returned an empty response.');
    }

    // OpenAI Whisper для транскрибации
    if (!config.openaiKey) {
        throw new Error('Provide an OpenAI API key to enable transcription.');
    }

    const url = 'https://api.openai.com/v1/audio/transcriptions';
    console.log(`%cTranscribe → %c[OpenAI Whisper] %c${config.model}`, 
        'color: #10b981; font-weight: bold',
        'color: #3b82f6; font-weight: bold',
        'color: #8b5cf6'
    );

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
    console.log('  📤 Request:', {
        url: url,
        model: config.model,
        audioSize: `${audioSizeKB} KB`,
        prompt: sanitizedPrompt || '(none)',
        formDataFields: sanitizedPrompt ? {prompt: sanitizedPrompt, model: config.model, file: `Blob(${audioSizeKB} KB)`} : {model: config.model, file: `Blob(${audioSizeKB} KB)`}
    });

    try {
        const {data} = await axios.post(url, formData, {
            headers: {
                Authorization: `Bearer ${sanitizedToken}`
            },
            timeout: 120_000,
            signal: controller.signal
        });
        const text = extractSpeechText(data);
        if (text) {
            console.log(`%cTranscribe ← %c[OpenAI Whisper] %c${config.model} %c[200]`, 
                'color: #10b981; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #22c55e; font-weight: bold'
            );
            console.log('  📥 Response:', {
                transcription: text,
                length: text.length,
                fullResponse: data
            });
            return text;
        }
    } catch (error: any) {
        if (controller.signal.aborted) {
            console.warn('[Transcribe] OpenAI request aborted or timed out.', {model: config.model});
            throw new Error('Transcription request was cancelled or timed out.');
        }
        const status = error?.response?.status || 'ERROR';
        console.error(`%cTranscribe ← %c[OpenAI Whisper] %c${config.model} %c[${status}]`, 
            'color: #ef4444; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6',
            'color: #ef4444; font-weight: bold'
        );
        if (error?.response?.data) {
            console.error('  ❌ Error data:', error.response.data);
        } else {
            console.error('  ❌ Error:', error.message);
        }
        throw error;
    }
    throw new Error('OpenAI returned an empty response.');
    } finally {
        clearTimeout(timeoutId);
        clearTimeout(slowWarnId);
        clearExternalAbort?.();
    }
};

export const processLLM = async (text: string, prompt: string, config: {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
}, options: { onChunk?: (chunk: string) => void } = {}): Promise<string> => {
    const provider = config.mode === 'api' 
        ? (config.googleKey ? 'Google Gemini' : 'OpenAI')
        : 'Local';
    const shouldStream = typeof options.onChunk === 'function';
    
    console.log(`%cLLM → %c[${provider}] %c${config.model}`, 
        'color: #10b981; font-weight: bold',
        'color: #3b82f6; font-weight: bold',
        'color: #8b5cf6'
    );
    console.log('  📤 Request:', {
        model: config.model,
        mode: config.mode,
        text: text,
        prompt: prompt,
        textLength: text.length,
        promptLength: prompt.length,
        streaming: shouldStream
    });
    
    try {
        const service = createLLMService(config.mode as any, config.model as any, {
            openaiKey: config.openaiKey,
            googleKey: config.googleKey,
            accessToken: config.accessToken
        });
        const canStream = shouldStream && service.supportsStreaming && typeof service.processStream === 'function';
        const result = canStream
            ? await service.processStream!(text, prompt, options.onChunk!)
            : await service.process(text, prompt);
        
        console.log(`%cLLM ← %c[${provider}] %c${config.model} %c[200]`, 
            'color: #10b981; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6',
            'color: #22c55e; font-weight: bold'
        );
        console.log('  📥 Response:', {
            result: result,
            resultLength: result.length
        });
        
        return result;
    } catch (error: any) {
        console.error(`%cLLM ← %c[${provider}] %c${config.model} %c[ERROR]`, 
            'color: #ef4444; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6',
            'color: #ef4444; font-weight: bold'
        );
        console.error('  ❌ Error:', error.message);
        if (error?.response?.data) {
            console.error('  ❌ Error data:', error.response.data);
        }
        throw error;
    }
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
