import type {ChatProvider, LLMMode} from '@shared/types';

const CHAT_MODEL_PREFERENCES_KEY = 'winky.chat-model-preferences';

export type ChatModelPreference = {
    provider?: ChatProvider;
    model_name?: string | null;
    llm_mode?: LLMMode | null;
};

const readPreferences = (): Record<string, ChatModelPreference> => {
    if (typeof window === 'undefined') {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(CHAT_MODEL_PREFERENCES_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, ChatModelPreference> : {};
    } catch {
        return {};
    }
};

const writePreferences = (value: Record<string, ChatModelPreference>): void => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(CHAT_MODEL_PREFERENCES_KEY, JSON.stringify(value));
    } catch {
        // Ignore storage failures.
    }
};

export const getChatModelPreference = (chatId: string): ChatModelPreference | null => {
    const preferences = readPreferences();
    return preferences[chatId] || null;
};

export const setChatModelPreference = (chatId: string, value: ChatModelPreference): void => {
    const preferences = readPreferences();
    preferences[chatId] = {
        ...preferences[chatId],
        ...value
    };
    writePreferences(preferences);
};

export const removeChatModelPreference = (chatId: string): void => {
    const preferences = readPreferences();
    if (!(chatId in preferences)) {
        return;
    }
    delete preferences[chatId];
    writePreferences(preferences);
};
