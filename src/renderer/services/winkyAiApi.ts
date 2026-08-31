import axios from 'axios';
import {triggerUnauthorized} from '@shared/api';
import {getApiBaseUrl, getWsBaseUrl} from '@shared/constants';
import {
    type WinkyTranscribeOptions,
    type WinkyTranscribeResult,
    winkyTranscriptionService
} from './WinkyTranscriptionService';
import {winkyWebSocketAuthService} from './WinkyWebSocketAuthService';
import type {
    WinkyChat,
    WinkyChatMessage,
    WinkyChatsPaginated,
    WinkyChatMessagesPaginated,
    WinkyChatBranchResponse,
    MessageChildrenResponse
} from '@shared/types';
const getWinkyAiLlmWsEndpoint = (): string => `${getWsBaseUrl()}/ws/ai/llm/`;
const getWinkyAiChatsEndpoint = (): string => `${getApiBaseUrl()}/ai/chats/`;
const getWinkyAiMessagesEndpoint = (): string => `${getApiBaseUrl()}/ai/messages/`;

const LOG_PREFIX = 'WinkyAI';

const logRequest = (method: string, url: string, paramsOrData?: unknown) => {
    console.log(`${LOG_PREFIX} → [${method}] ${url}`, {hasPayload: paramsOrData !== undefined});
};

const logResponse = (method: string, url: string, status: number, _data: unknown) => {
    console.log(`${LOG_PREFIX} ← [${method}] ${url} [${status}]`);
};

const logError = (method: string, url: string, error: unknown) => {
    const status = axios.isAxiosError(error) ? error.response?.status || 'ERR' : 'ERR';
    if (status === 401) triggerUnauthorized();
    console.error(`${LOG_PREFIX} ← [${method}] ${url} [${status}]`, {
        errorType: error instanceof Error ? error.name : 'unknown'
    });
};

export type {WinkyTranscribeResult};

export interface WinkyLLMParams {
    prompt: string;
    model_level: 'low' | 'mid' | 'high';
    chat_id?: string;
    parent_message_id?: string | null;
    preferred_title?: string;
    additional_context?: string;
}

export interface WinkyLLMResult {
    chat_id: string;
    user_message_id: string;
    assistant_message_id: string;
    content: string;
    credits: number;
    model_level: 'low' | 'mid' | 'high';
}

export interface WinkyLLMStreamCallbacks {
    onStart?: (payload: {
        chat_id: string;
        user_message_id: string;
        model_level: 'low' | 'mid' | 'high';
    }) => void;
}

export const winkyTranscribe = async (
    audio: ArrayBuffer,
    _accessToken: string,
    options?: WinkyTranscribeOptions
): Promise<WinkyTranscribeResult> => winkyTranscriptionService.transcribe(audio, options);

type AIWSEvent =
    | {event: 'start'; chat_id: string; user_message_id: string; model_level: string}
    | {event: 'delta'; text: string; chat_id: string; message_id: string; model_level: string}
    | {event: 'done'; chat_id: string; message_id: string; model_level: string; credits: string}
    | {event: 'cancelled'}
    | {event: 'error'; code: string; message: string};

export const winkyLLMStream = async (
    params: WinkyLLMParams,
    accessToken: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    callbacks?: WinkyLLMStreamCallbacks
): Promise<WinkyLLMResult> => {
    const wsEndpoint = getWinkyAiLlmWsEndpoint();
    const ws = await winkyWebSocketAuthService.create(wsEndpoint, signal);
    return new Promise((resolve, reject) => {
        console.log(`${LOG_PREFIX} → [WS] ${wsEndpoint}`);
        console.log('  📤 Request metadata:', {
            model_level: params.model_level,
            has_chat: Boolean(params.chat_id),
            has_parent: Boolean(params.parent_message_id)
        });

        let fullContent = '';
        let chatId = params.chat_id || '';
        let userMessageId = '';
        let assistantMessageId = '';
        let credits = 0;
        let modelLevel = params.model_level;
        let resolved = false;

        const resolveContent = async (): Promise<string> => {
            if (fullContent.trim().length > 0 || !assistantMessageId) {
                return fullContent;
            }
            try {
                const branch = await fetchMessageBranch(assistantMessageId, accessToken);
                const assistantMessage = [...branch.items]
                    .reverse()
                    .find((message) => message.id === assistantMessageId);
                return assistantMessage?.content || fullContent;
            } catch (error) {
                console.warn(`${LOG_PREFIX} ← [WS] failed to backfill assistant content`, error);
                return fullContent;
            }
        };

        const finalizeResolve = async () => ({
            chat_id: chatId,
            user_message_id: userMessageId,
            assistant_message_id: assistantMessageId,
            content: await resolveContent(),
            credits,
            model_level: modelLevel
        });

        const cleanup = () => {
            signal?.removeEventListener('abort', handleAbort);
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };

        const handleAbort = () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({action: 'cancel'}));
            }
            cleanup();
            if (!resolved) {
                resolved = true;
                reject(new DOMException('Aborted', 'AbortError'));
            }
        };

        signal?.addEventListener('abort', handleAbort, {once: true});

        ws.onopen = () => {
            if (resolved || signal?.aborted) {
                handleAbort();
                return;
            }
            ws.send(JSON.stringify({
                action: 'generate',
                prompt: params.prompt,
                model_level: params.model_level,
                chat_id: params.chat_id,
                parent_message_id: params.parent_message_id,
                preferred_title: params.preferred_title,
                additional_context: params.additional_context
            }));
        };

        ws.onmessage = (event) => {
            try {
                const data: AIWSEvent = JSON.parse(event.data);

                switch (data.event) {
                    case 'start':
                        chatId = data.chat_id;
                        userMessageId = data.user_message_id;
                        modelLevel = data.model_level as 'low' | 'mid' | 'high';
                        callbacks?.onStart?.({
                            chat_id: chatId,
                            user_message_id: userMessageId,
                            model_level: modelLevel
                        });
                        console.log(`${LOG_PREFIX} ← [WS] start`, {chat_id: chatId, user_message_id: userMessageId});
                        break;

                    case 'delta':
                        fullContent += data.text;
                        onChunk(data.text);
                        break;

                    case 'done':
                        assistantMessageId = data.message_id;
                        credits = parseFloat(data.credits) || 0;
                        console.log(`${LOG_PREFIX} ← [WS] done`, {chat_id: chatId, assistant_message_id: assistantMessageId, credits});
                        cleanup();
                        if (!resolved) {
                            resolved = true;
                            void finalizeResolve().then(resolve, reject);
                        }
                        break;

                    case 'cancelled':
                        console.log(`${LOG_PREFIX} ← [WS] cancelled`);
                        cleanup();
                        if (!resolved) {
                            resolved = true;
                            reject(new DOMException('Cancelled', 'AbortError'));
                        }
                        break;

                    case 'error':
                        if (data.code === 'unauthorized' || data.code === 'authentication_failed') triggerUnauthorized();
                        console.error(`${LOG_PREFIX} ← [WS] error`, {code: data.code});
                        cleanup();
                        if (!resolved) {
                            resolved = true;
                            const error = new Error(data.message);
                            (error as any).code = data.code;
                            reject(error);
                        }
                        break;
                }
            } catch (error) {
                console.warn(`${LOG_PREFIX} ← [WS] invalid event`, {
                    errorType: error instanceof Error ? error.name : 'unknown'
                });
            }
        };

        ws.onerror = () => {
            console.error(`${LOG_PREFIX} ← [WS] connection error`);
            cleanup();
            if (!resolved) {
                resolved = true;
                reject(new Error('WebSocket connection error'));
            }
        };

        ws.onclose = (event) => {
            signal?.removeEventListener('abort', handleAbort);
            if (!resolved) {
                resolved = true;
                if (event.code !== 1000) {
                    reject(new Error(`WebSocket closed: ${event.reason || event.code}`));
                } else {
                    void finalizeResolve().then(resolve, reject);
                }
            }
        };
        if (signal?.aborted) handleAbort();
    });
};

export const fetchWinkyChats = async (
    accessToken: string,
    page: number = 1,
    pageSize: number = 20
): Promise<WinkyChatsPaginated> => {
    const url = getWinkyAiChatsEndpoint();
    const params = {page, page_size: pageSize};
    logRequest('GET', url, params);
    try {
        const response = await axios.get<WinkyChatsPaginated>(url, {
            headers: {Authorization: `Bearer ${accessToken}`},
            params
        });
        logResponse('GET', url, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('GET', url, error);
        throw error;
    }
};

export const fetchWinkyChatMessages = async (
    chatId: string,
    accessToken: string,
    page: number = 1,
    pageSize: number = 50
): Promise<WinkyChatMessagesPaginated> => {
    const url = `${getWinkyAiChatsEndpoint()}${chatId}/messages/`;
    const params = {page, page_size: pageSize};
    logRequest('GET', url, params);
    try {
        const response = await axios.get<WinkyChatMessagesPaginated>(url, {
            headers: {Authorization: `Bearer ${accessToken}`},
            params
        });
        logResponse('GET', url, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('GET', url, error);
        throw error;
    }
};

export const updateWinkyChat = async (
    chatId: string,
    updates: Partial<Pick<WinkyChat, 'title' | 'additional_context'>> & {pinned?: boolean},
    accessToken: string
): Promise<WinkyChat> => {
    const url = `${getWinkyAiChatsEndpoint()}${chatId}/`;
    logRequest('PATCH', url, updates);
    try {
        const response = await axios.patch<WinkyChat>(url, updates, {
            headers: {Authorization: `Bearer ${accessToken}`}
        });
        logResponse('PATCH', url, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('PATCH', url, error);
        throw error;
    }
};

export const deleteWinkyChat = async (chatId: string, accessToken: string): Promise<void> => {
    const url = `${getWinkyAiChatsEndpoint()}${chatId}/`;
    logRequest('DELETE', url);
    try {
        const response = await axios.delete(url, {
            headers: {Authorization: `Bearer ${accessToken}`}
        });
        console.log(`${LOG_PREFIX} ← [DELETE] ${url} [${response.status}]`);
    } catch (error) {
        logError('DELETE', url, error);
        throw error;
    }
};

export const fetchWinkyChat = async (chatId: string, accessToken: string): Promise<WinkyChat> => {
    const url = `${getWinkyAiChatsEndpoint()}${chatId}/`;
    logRequest('GET', url);
    try {
        const response = await axios.get<WinkyChat>(url, {
            headers: {Authorization: `Bearer ${accessToken}`}
        });
        logResponse('GET', url, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('GET', url, error);
        throw error;
    }
};

export const fetchMessageChildren = async (
    messageId: string,
    accessToken: string
): Promise<MessageChildrenResponse> => {
    const url = `${getWinkyAiMessagesEndpoint()}${messageId}/children/`;
    logRequest('GET', url);
    try {
        const response = await axios.get<MessageChildrenResponse>(url, {
            headers: {Authorization: `Bearer ${accessToken}`}
        });
        logResponse('GET', url, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('GET', url, error);
        throw error;
    }
};

export interface MessageBranchResponse {
    chat_id: string;
    items: WinkyChatMessage[];
}

export const fetchMessageBranch = async (
    messageId: string,
    accessToken: string
): Promise<MessageBranchResponse> => {
    const url = `${getWinkyAiMessagesEndpoint()}${messageId}/branch/`;
    logRequest('GET', url);
    try {
        const response = await axios.get<MessageBranchResponse>(url, {
            headers: {Authorization: `Bearer ${accessToken}`}
        });
        logResponse('GET', url, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('GET', url, error);
        throw error;
    }
};

export const fetchWinkyChatBranch = async (
    chatId: string,
    accessToken: string,
    options?: {
        leafMessageId?: string;
        cursor?: string;
        limit?: number;
    }
): Promise<WinkyChatBranchResponse> => {
    const url = `${getWinkyAiChatsEndpoint()}${chatId}/branch/`;
    const params: Record<string, string | number> = {};
    if (options?.leafMessageId) params.leaf_message_id = options.leafMessageId;
    if (options?.cursor) params.cursor = options.cursor;
    if (options?.limit) params.limit = options.limit;

    logRequest('GET', url, params);
    try {
        const response = await axios.get<WinkyChatBranchResponse>(url, {
            headers: {Authorization: `Bearer ${accessToken}`},
            params
        });
        logResponse('GET', url, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('GET', url, error);
        throw error;
    }
};


