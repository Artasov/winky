import axios, {AxiosInstance} from 'axios';
import FormData from 'form-data';
import {createApiClient} from '@shared/api';
import {
    SPEECH_MODES,
    ME_ENDPOINT,
    FAST_WHISPER_TRANSCRIBE_ENDPOINT,
    FAST_WHISPER_TRANSCRIBE_TIMEOUT
} from '@shared/constants';
import type {ActionConfig, ActionIcon, AppConfig, AuthTokens, WinkyProfile, User} from '@shared/types';
import {getConfig, setActions} from '../config';
import {createLLMService} from '../services/llm/factory';
import {sendLogToRenderer} from '../utils/logger';
import {broadcastConfigUpdate} from './configSync';

export type SpeechTranscribeConfig = {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
    prompt?: string;
};

export const fetchCurrentUser = async (options: {includeTiersAndFeatures?: boolean} = {}): Promise<User | null> => {
    const config = await getConfig();
    if (!config.auth.accessToken) {
        return null;
    }
    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const url = options.includeTiersAndFeatures ? `${ME_ENDPOINT}?tiers_and_features=1` : ME_ENDPOINT;
    const {data} = await client.get<User>(url);
    return data;
};

export const fetchActions = async (): Promise<ActionConfig[]> => {
    const config = await getConfig();
    if (!config.auth.accessToken) {
        return config.actions;
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const actions = await fetchAllPages<ActionConfig>(client, ACTIONS_API_PATH);
    await setActions(actions);
    await broadcastConfigUpdate();
    return actions;
};

export const createAction = async (action: ActionPayload): Promise<ActionConfig[]> => {
    const config = await getConfig();
    ensureAuthorized(config);

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.post<ActionConfig>(ACTIONS_API_PATH, action);
    const updated = [...config.actions.filter(({id}) => id !== data.id), data];
    await setActions(updated);
    await broadcastConfigUpdate();
    return updated;
};

export const updateAction = async (actionId: string, action: ActionPayload): Promise<ActionConfig[]> => {
    const config = await getConfig();
    ensureAuthorized(config);

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.patch<ActionConfig>(`${ACTIONS_API_PATH}${actionId}/`, action);
    const updated = config.actions.map((existing) => (existing.id === actionId ? data : existing));
    await setActions(updated);
    await broadcastConfigUpdate();
    return updated;
};

export const deleteAction = async (actionId: string): Promise<ActionConfig[]> => {
    const config = await getConfig();
    ensureAuthorized(config);

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    await client.delete(`${ACTIONS_API_PATH}${actionId}/`);
    const updated = config.actions.filter(({id}) => id !== actionId);
    await setActions(updated);
    await broadcastConfigUpdate();
    return updated;
};

export const fetchIcons = async (): Promise<ActionIcon[]> => {
    const config = await getConfig();
    ensureAuthorized(config);
    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    return fetchAllPages<ActionIcon>(client, ICONS_API_PATH);
};

export const fetchProfile = async (): Promise<WinkyProfile> => {
    const config = await getConfig();
    ensureAuthorized(config);
    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.get<WinkyProfile>(PROFILE_API_PATH);
    return data;
};

export const transcribeAudio = async (audioData: ArrayBuffer, config: SpeechTranscribeConfig): Promise<string> => {
    const buffer = Buffer.from(audioData);

    const buildFormData = (extraFields: Record<string, string> = {}) => {
        const formData = new FormData();
        formData.append('file', buffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        formData.append('model', config.model);
        for (const [key, value] of Object.entries(extraFields)) {
            formData.append(key, value);
        }
        return formData;
    };

    const promptValue = config.prompt?.trim();

    if (config.mode === SPEECH_MODES.LOCAL) {
        const extraFields: Record<string, string> = {response_format: 'json'};
        if (promptValue) {
            extraFields.prompt = promptValue;
        }
        const formData = buildFormData(extraFields);
        try {
            const {data} = await axios.post(FAST_WHISPER_TRANSCRIBE_ENDPOINT, formData, {
                headers: {
                    ...formData.getHeaders()
                },
                timeout: FAST_WHISPER_TRANSCRIBE_TIMEOUT
            });
            const text = extractSpeechText(data);
            return typeof text === 'string' ? text : '';
        } catch (error) {
            if (isEmptyLocalTranscriptionError(error)) {
                return '';
            }
            const reason = describeAxiosError(
                error,
                'Локальный сервер fast-fast-whisper не отвечает. Проверьте установку и статус сервера.'
            );
            throw new Error(`Локальный сервер fast-fast-whisper не отвечает: ${reason}`);
        }
    }

    if (!config.openaiKey) {
        throw new Error('Укажите OpenAI API ключ для транскрибации.');
    }

    const formData = buildFormData(promptValue ? {prompt: promptValue} : {});
    const headers = {
        ...formData.getHeaders(),
        Authorization: `Bearer ${config.openaiKey}`
    };

    try {
        const {data} = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers,
            timeout: 120_000
        });
        const text = extractSpeechText(data);
        if (!text) {
            throw new Error('OpenAI вернул пустой ответ.');
        }
        return text;
    } catch (error) {
        const reason = describeAxiosError(error, 'Не удалось распознать речь через OpenAI.');
        throw new Error(`Не удалось распознать речь: ${reason}`);
    }
};

export const processLLM = async (text: string, prompt: string, config: {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string
}): Promise<string> => {
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });

    return await service.process(text, prompt);
};

export const processLLMStream = async (text: string, prompt: string, config: {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string
}): Promise<string> => {
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });
    return await service.process(text, prompt);
};

const ACTIONS_API_PATH = 'winky/actions/';
const ICONS_API_PATH = 'winky/icons/';
const PROFILE_API_PATH = 'winky/profile/';

const ensureAuthorized = (config: AppConfig) => {
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }
};

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

interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

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
        const pageData = response.data;
        if (Array.isArray(pageData.results)) {
            results.push(...pageData.results);
        }
        nextUrl = pageData.next;
    }

    return results;
};

const extractSpeechText = (payload: any): string => {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.transcription === 'string') return payload.transcription;
    if (typeof payload.result === 'string') return payload.result;
    if (payload.data) return extractSpeechText(payload.data);
    return '';
};

const describeAxiosError = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError(error)) {
        const {response, message} = error;
        const detail = response?.data?.detail || response?.data?.error?.message || response?.data?.message;
        if (typeof detail === 'string' && detail.trim()) {
            return detail;
        }
        if (typeof response?.data === 'string' && response.data.trim()) {
            return response.data.trim();
        }
        return message || fallback;
    }
    if (error instanceof Error) {
        return error.message || fallback;
    }
    return fallback;
};

const isEmptyLocalTranscriptionError = (error: unknown): boolean => {
    if (!error) {
        return false;
    }
    const detail =
        (axios.isAxiosError(error) && (error.response?.data?.detail || error.response?.data?.message)) || (error as any)?.message;
    if (typeof detail !== 'string') {
        return false;
    }
    const normalized = detail.toLowerCase();
    return normalized.includes('пустой ответ') || normalized.includes('empty response');
};
