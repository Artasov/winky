import type {LLMMode} from '@shared/types';

const STORAGE_KEY = 'winky.chat-launch-requests';

export interface ChatLaunchRequest {
    id: string;
    text: string;
    preferredTitle?: string;
    additionalContext?: string;
    mode: LLMMode;
    model: string;
    createdAt: string;
}

type LaunchRequestMap = Record<string, ChatLaunchRequest>;

const createId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const readState = (): LaunchRequestMap => {
    if (typeof window === 'undefined') {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }
        return JSON.parse(raw) as LaunchRequestMap;
    } catch (error) {
        console.warn('[chatLaunchRequests] Failed to read launch requests', error);
        return {};
    }
};

const writeState = (state: LaunchRequestMap): void => {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const createChatLaunchRequest = (
    request: Omit<ChatLaunchRequest, 'id' | 'createdAt'>
): ChatLaunchRequest => {
    const nextRequest: ChatLaunchRequest = {
        ...request,
        id: createId(),
        createdAt: new Date().toISOString()
    };
    const state = readState();
    state[nextRequest.id] = nextRequest;
    writeState(state);
    return nextRequest;
};

export const consumeChatLaunchRequest = (requestId: string): ChatLaunchRequest | null => {
    const state = readState();
    const request = state[requestId] || null;
    if (!request) {
        return null;
    }
    delete state[requestId];
    writeState(state);
    return request;
};
