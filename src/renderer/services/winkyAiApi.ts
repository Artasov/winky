import axios from 'axios';
import {API_BASE_URL, WS_BASE_URL} from '@shared/constants';
import type {
    WinkyChat,
    WinkyChatMessage,
    WinkyChatsPaginated,
    WinkyChatMessagesPaginated
} from '@shared/types';

const WINKY_AI_TRANSCRIBE_ENDPOINT = `${API_BASE_URL}/ai/transcribe/`;
const WINKY_AI_LLM_WS_ENDPOINT = `${WS_BASE_URL}/ws/ai/llm/`;
const WINKY_AI_CHATS_ENDPOINT = `${API_BASE_URL}/ai/chats/`;
const WINKY_AI_MESSAGES_ENDPOINT = `${API_BASE_URL}/ai/messages/`;

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

    const {data} = await axios.post<WinkyTranscribeResult>(
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
    return data;
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
                        break;

                    case 'delta':
                        fullContent += data.text;
                        onChunk(data.text);
                        break;

                    case 'done':
                        assistantMessageId = data.message_id;
                        credits = parseFloat(data.credits) || 0;
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
                        cleanup();
                        if (!resolved) {
                            resolved = true;
                            reject(new DOMException('Cancelled', 'AbortError'));
                        }
                        break;

                    case 'error':
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
    const {data} = await axios.get<WinkyChatsPaginated>(WINKY_AI_CHATS_ENDPOINT, {
        headers: {Authorization: `Bearer ${accessToken}`},
        params: {page, page_size: pageSize}
    });
    return data;
};

export const fetchWinkyChatMessages = async (
    chatId: string,
    accessToken: string,
    page: number = 1,
    pageSize: number = 50
): Promise<WinkyChatMessagesPaginated> => {
    const {data} = await axios.get<WinkyChatMessagesPaginated>(
        `${WINKY_AI_CHATS_ENDPOINT}${chatId}/messages/`,
        {
            headers: {Authorization: `Bearer ${accessToken}`},
            params: {page, page_size: pageSize}
        }
    );
    return data;
};

export const updateWinkyChat = async (
    chatId: string,
    updates: Partial<Pick<WinkyChat, 'title' | 'additional_context'>>,
    accessToken: string
): Promise<WinkyChat> => {
    const {data} = await axios.patch<WinkyChat>(
        `${WINKY_AI_CHATS_ENDPOINT}${chatId}/`,
        updates,
        {headers: {Authorization: `Bearer ${accessToken}`}}
    );
    return data;
};

export const deleteWinkyChat = async (chatId: string, accessToken: string): Promise<void> => {
    await axios.delete(`${WINKY_AI_CHATS_ENDPOINT}${chatId}/`, {
        headers: {Authorization: `Bearer ${accessToken}`}
    });
};

export const fetchWinkyChat = async (chatId: string, accessToken: string): Promise<WinkyChat> => {
    const {data} = await axios.get<WinkyChat>(
        `${WINKY_AI_CHATS_ENDPOINT}${chatId}/`,
        {headers: {Authorization: `Bearer ${accessToken}`}}
    );
    return data;
};

export interface MessageChildrenResponse {
    chat_id: string;
    parent_id: string;
    items: WinkyChatMessage[];
}

export const fetchMessageChildren = async (
    messageId: string,
    accessToken: string
): Promise<MessageChildrenResponse> => {
    const {data} = await axios.get<MessageChildrenResponse>(
        `${WINKY_AI_MESSAGES_ENDPOINT}${messageId}/children/`,
        {headers: {Authorization: `Bearer ${accessToken}`}}
    );
    return data;
};

export interface MessageBranchResponse {
    chat_id: string;
    items: WinkyChatMessage[];
}

export const fetchMessageBranch = async (
    messageId: string,
    accessToken: string
): Promise<MessageBranchResponse> => {
    const {data} = await axios.get<MessageBranchResponse>(
        `${WINKY_AI_MESSAGES_ENDPOINT}${messageId}/branch/`,
        {headers: {Authorization: `Bearer ${accessToken}`}}
    );
    return data;
};
