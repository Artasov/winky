import axios, {AxiosInstance} from 'axios';
import {invoke} from '@tauri-apps/api/core';
import {createApiClient} from '@shared/api';
import {
    FAST_WHISPER_TRANSCRIBE_ENDPOINT,
    FAST_WHISPER_TRANSCRIBE_TIMEOUT,
    ME_ENDPOINT,
    SPEECH_MODES
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

    if (!config.openaiKey) {
        throw new Error('Укажите OpenAI API ключ для транскрибации.');
    }

    const formData = buildFormData(promptValue ? {prompt: promptValue} : {});
    const headers = {
        Authorization: `Bearer ${config.openaiKey}`
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
