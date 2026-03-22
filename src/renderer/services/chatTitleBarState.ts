type ChatTitleBarModelState = {
    sourceId: string;
    value: string;
    options: string[];
    disabled?: boolean;
    onChange: (value: string) => void;
} | null;

const CHAT_TITLEBAR_MODEL_EVENT = 'winky:chat-titlebar-model-changed';

let currentState: ChatTitleBarModelState = null;

const emitChatTitleBarState = () => {
    if (typeof window === 'undefined') {
        return;
    }
    window.dispatchEvent(new CustomEvent(CHAT_TITLEBAR_MODEL_EVENT));
};

export const getChatTitleBarModelState = (): ChatTitleBarModelState => currentState;

export const setChatTitleBarModelState = (state: ChatTitleBarModelState): void => {
    currentState = state;
    emitChatTitleBarState();
};

export const clearChatTitleBarModelState = (sourceId: string): void => {
    if (!currentState || currentState.sourceId !== sourceId) {
        return;
    }
    currentState = null;
    emitChatTitleBarState();
};

export const subscribeChatTitleBarModelState = (
    listener: (state: ChatTitleBarModelState) => void
): (() => void) => {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    const handleChange = () => {
        listener(getChatTitleBarModelState());
    };

    window.addEventListener(CHAT_TITLEBAR_MODEL_EVENT, handleChange);
    return () => {
        window.removeEventListener(CHAT_TITLEBAR_MODEL_EVENT, handleChange);
    };
};
