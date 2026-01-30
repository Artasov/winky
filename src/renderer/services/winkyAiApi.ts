import axios from 'axios';
import {API_BASE_URL, WS_BASE_URL} from '@shared/constants';
import type {
    WinkyChat,
    WinkyChatMessage,
    WinkyChatsPaginated,
    WinkyChatMessagesPaginated,
    WinkyChatBranchResponse,
    MessageChildrenResponse
} from '@shared/types';

const WINKY_AI_TRANSCRIBE_ENDPOINT = `${API_BASE_URL}/ai/transcribe/`;
const WINKY_AI_LLM_WS_ENDPOINT = `${WS_BASE_URL}/ws/ai/llm/`;
const WINKY_AI_CHATS_ENDPOINT = `${API_BASE_URL}/ai/chats/`;
const WINKY_AI_MESSAGES_ENDPOINT = `${API_BASE_URL}/ai/messages/`;

const LOG_PREFIX = 'WinkyAI';

const logRequest = (method: string, url: string, paramsOrData?: any) => {
    console.log(`${LOG_PREFIX} → [${method}] ${url}`);
    if (paramsOrData) {
        const label = method === 'GET' ? '  📤 Request params:' : '  📤 Request data:';
        console.log(label, paramsOrData);
    }
};

const logResponse = (method: string, url: string, status: number, data: any) => {
    console.log(`${LOG_PREFIX} ← [${method}] ${url} [${status}]`);
    console.log('  📥 Response data:', data);
};

const logError = (method: string, url: string, error: any) => {
    const status = error.response?.status || 'ERR';
    console.error(`${LOG_PREFIX} ← [${method}] ${url} [${status}]`);
    console.error('  ❌ Error:', error.message || error);
};

export interface WinkyTranscribeResult {
    id: string;
    text: string;
    model_level: 'transcribe';
    credits: string;
    language?: string;
    created_at: string;
}

export interface WinkyLLMParams {
    prompt: string;
    model_level: 'low' | 'high';
    chat_id?: string;
    parent_message_id?: string | null;
}

export interface WinkyLLMResult {
    chat_id: string;
    user_message_id: string;
    assistant_message_id: string;
    content: string;
    credits: number;
    model_level: 'low' | 'high';
}

export const winkyTranscribe = async (
    audio: ArrayBuffer,
    accessToken: string,
    options?: {language?: string; mimeType?: string}
): Promise<WinkyTranscribeResult> => {
    const mimeType = options?.mimeType || 'audio/webm';
    const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'webm';
    const blob = new Blob([audio], {type: mimeType});
    const formData = new FormData();
    formData.append('file', blob, `audio.${extension}`);
    if (options?.language) formData.append('language', options.language);

    logRequest('POST', WINKY_AI_TRANSCRIBE_ENDPOINT, {mimeType, language: options?.language});
    try {
        const response = await axios.post<WinkyTranscribeResult>(
            WINKY_AI_TRANSCRIBE_ENDPOINT,
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${accessToken}`
                },
                timeout: 120_000
            }
        );
        logResponse('POST', WINKY_AI_TRANSCRIBE_ENDPOINT, response.status, response.data);
        return response.data;
    } catch (error) {
        logError('POST', WINKY_AI_TRANSCRIBE_ENDPOINT, error);
        throw error;
    }
};

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
    signal?: AbortSignal
): Promise<WinkyLLMResult> => {
    return new Promise((resolve, reject) => {
        const wsUrl = `${WINKY_AI_LLM_WS_ENDPOINT}?token=${accessToken}`;
        console.log(`${LOG_PREFIX} → [WS] ${WINKY_AI_LLM_WS_ENDPOINT}`);
        console.log('  📤 Request params:', {prompt: params.prompt.slice(0, 100) + '...', model_level: params.model_level, chat_id: params.chat_id, parent_message_id: params.parent_message_id});
        const ws = new WebSocket(wsUrl);

        let fullContent = '';
        let chatId = params.chat_id || '';
        let userMessageId = '';
        let assistantMessageId = '';
        let credits = 0;
        let modelLevel = params.model_level;
        let resolved = false;

        const cleanup = () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };

        if (signal) {
            signal.addEventListener('abort', () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({action: 'cancel'}));
                }
                cleanup();
                if (!resolved) {
                    resolved = true;
                    reject(new DOMException('Aborted', 'AbortError'));
                }
            });
        }

        ws.onopen = () => {
            ws.send(JSON.stringify({
                action: 'generate',
                prompt: params.prompt,
                model_level: params.model_level,
                chat_id: params.chat_id,
                parent_message_id: params.parent_message_id
            }));
        };

        ws.onmessage = (event) => {
            try {
                const data: AIWSEvent = JSON.parse(event.data);

                switch (data.event) {
                    case 'start':
                        chatId = data.chat_id;
                        userMessageId = data.user_message_id;
                        modelLevel = data.model_level as 'low' | 'high';
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
                            resolve({
                                chat_id: chatId,
                                user_message_id: userMessageId,
                                assistant_message_id: assistantMessageId,
                                content: fullContent,
                                credits,
                                model_level: modelLevel
                            });
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
                        console.error(`${LOG_PREFIX} ← [WS] error`, {code: data.code, message: data.message});
                        cleanup();
                        if (!resolved) {
                            resolved = true;
                            const error = new Error(data.message);
                            (error as any).code = data.code;
                            reject(error);
                        }
                        break;
                }
            } catch (e) {
                // Skip invalid JSON
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
            if (!resolved) {
                resolved = true;
                if (event.code !== 1000) {
                    reject(new Error(`WebSocket closed: ${event.reason || event.code}`));
                } else {
                    resolve({
                        chat_id: chatId,
                        user_message_id: userMessageId,
                        assistant_message_id: assistantMessageId,
                        content: fullContent,
                        credits,
                        model_level: modelLevel
                    });
                }
            }
        };
    });
};

export const fetchWinkyChats = async (
    accessToken: string,
    page: number = 1,
    pageSize: number = 20
): Promise<WinkyChatsPaginated> => {
    const url = WINKY_AI_CHATS_ENDPOINT;
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
    const url = `${WINKY_AI_CHATS_ENDPOINT}${chatId}/messages/`;
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
    const url = `${WINKY_AI_CHATS_ENDPOINT}${chatId}/`;
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
    const url = `${WINKY_AI_CHATS_ENDPOINT}${chatId}/`;
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
    const url = `${WINKY_AI_CHATS_ENDPOINT}${chatId}/`;
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
    const url = `${WINKY_AI_MESSAGES_ENDPOINT}${messageId}/children/`;
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
    const url = `${WINKY_AI_MESSAGES_ENDPOINT}${messageId}/branch/`;
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
    const url = `${WINKY_AI_CHATS_ENDPOINT}${chatId}/branch/`;
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
