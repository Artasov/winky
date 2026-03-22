import type {WinkyChat, WinkyChatMessage} from '@shared/types';

const STORAGE_KEY = 'winky.hybrid_chats';
const CHANGE_EVENT = 'winky:hybrid-chats-changed';

type StoredChatRecord = {
    chat: WinkyChat;
    messages: WinkyChatMessage[];
};

type HybridChatState = {
    version: 1;
    localChats: Record<string, StoredChatRecord>;
    remoteDrafts: Record<string, StoredChatRecord>;
};

type ChatStorageSnapshot = {
    localChats: WinkyChat[];
    remoteDrafts: WinkyChat[];
};

type LocalSiblingsInfo = {
    items: WinkyChatMessage[];
    total: number;
    currentIndex: number;
};

const createEmptyState = (): HybridChatState => ({
    version: 1,
    localChats: {},
    remoteDrafts: {}
});

const cloneRecord = (record: StoredChatRecord): StoredChatRecord => ({
    chat: {...record.chat},
    messages: record.messages.map((message) => ({...message}))
});

const cloneChat = (chat: WinkyChat): WinkyChat => ({...chat});

const readState = (): HybridChatState => {
    if (typeof window === 'undefined') {
        return createEmptyState();
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return createEmptyState();
        }
        const parsed = JSON.parse(raw) as Partial<HybridChatState>;
        return {
            version: 1,
            localChats: parsed.localChats ?? {},
            remoteDrafts: parsed.remoteDrafts ?? {}
        };
    } catch (error) {
        console.warn('[chatStorage] Failed to read storage state', error);
        return createEmptyState();
    }
};

const emitChange = () => {
    if (typeof window === 'undefined') {
        return;
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
};

const writeState = (state: HybridChatState): void => {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    emitChange();
};

const updateState = (updater: (state: HybridChatState) => HybridChatState): void => {
    const state = readState();
    writeState(updater(state));
};

const getRecord = (collection: Record<string, StoredChatRecord>, chatId: string): StoredChatRecord | null => {
    const record = collection[chatId];
    return record ? cloneRecord(record) : null;
};

const mergeMessages = (messages: WinkyChatMessage[]): WinkyChatMessage[] => {
    const map = new Map<string, WinkyChatMessage>();
    for (const message of messages) {
        map.set(message.id, {...message});
    }
    return [...map.values()].sort((left, right) => {
        const leftTime = new Date(left.created_at).getTime();
        const rightTime = new Date(right.created_at).getTime();
        if (leftTime !== rightTime) {
            return leftTime - rightTime;
        }
        if (left.parent_id === right.id) {
            return 1;
        }
        if (right.parent_id === left.id) {
            return -1;
        }
        if (left.role !== right.role) {
            return left.role === 'user' ? -1 : 1;
        }
        return left.id.localeCompare(right.id);
    });
};

const mergeRecordMessages = (
    current: StoredChatRecord | undefined,
    messages?: WinkyChatMessage[]
): WinkyChatMessage[] => {
    if (!messages) {
        return current?.messages ?? [];
    }
    return mergeMessages([...(current?.messages ?? []), ...messages]);
};

const getMessageMap = (messages: WinkyChatMessage[]): Map<string, WinkyChatMessage> => (
    new Map(messages.map((message) => [message.id, message]))
);

const getChildrenMap = (messages: WinkyChatMessage[]): Map<string | null, WinkyChatMessage[]> => {
    const map = new Map<string | null, WinkyChatMessage[]>();
    for (const message of mergeMessages(messages)) {
        const key = message.parent_id || null;
        const current = map.get(key) || [];
        current.push(message);
        map.set(key, current);
    }
    return map;
};

const getLeafMessages = (messages: WinkyChatMessage[]): WinkyChatMessage[] => {
    const parentIds = new Set(messages.map((message) => message.parent_id).filter(Boolean));
    return mergeMessages(messages).filter((message) => !parentIds.has(message.id));
};

const pickLeafMessage = (messages: WinkyChatMessage[], preferredLeafId?: string | null): WinkyChatMessage | null => {
    if (messages.length === 0) {
        return null;
    }
    const messageMap = getMessageMap(messages);
    if (preferredLeafId && messageMap.has(preferredLeafId)) {
        return messageMap.get(preferredLeafId) || null;
    }
    const leaves = getLeafMessages(messages);
    return leaves[leaves.length - 1] || mergeMessages(messages)[messages.length - 1] || null;
};

const annotateBranchSiblings = (
    branch: WinkyChatMessage[],
    allMessages: WinkyChatMessage[]
): WinkyChatMessage[] => {
    const childrenMap = getChildrenMap(allMessages);
    return branch.map((message) => {
        const siblings = childrenMap.get(message.parent_id || null) || [message];
        const siblingIndex = siblings.findIndex((item) => item.id === message.id);
        return {
            ...message,
            sibling_count: Math.max(0, siblings.length - 1),
            sibling_index: siblingIndex >= 0 ? siblingIndex : 0
        };
    });
};

const getBranchFromLeaf = (messages: WinkyChatMessage[], leafId?: string | null): WinkyChatMessage[] => {
    const sortedMessages = mergeMessages(messages);
    const leaf = pickLeafMessage(sortedMessages, leafId);
    if (!leaf) {
        return [];
    }
    const messageMap = getMessageMap(sortedMessages);
    const branch: WinkyChatMessage[] = [];
    let current: WinkyChatMessage | undefined | null = leaf;
    while (current) {
        branch.push(current);
        current = current.parent_id ? messageMap.get(current.parent_id) : null;
    }
    return annotateBranchSiblings(branch.reverse(), sortedMessages);
};

const collectSubtreeIds = (messages: WinkyChatMessage[], rootId: string): Set<string> => {
    const childrenMap = getChildrenMap(messages);
    const subtreeIds = new Set<string>();
    const queue: string[] = [rootId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || subtreeIds.has(currentId)) {
            continue;
        }
        subtreeIds.add(currentId);
        const children = childrenMap.get(currentId) || [];
        children.forEach((child) => queue.push(child.id));
    }
    return subtreeIds;
};

const getLeafForSubtree = (messages: WinkyChatMessage[], rootId: string): WinkyChatMessage | null => {
    const subtreeIds = collectSubtreeIds(messages, rootId);
    const subtreeMessages = mergeMessages(messages).filter((message) => subtreeIds.has(message.id));
    return pickLeafMessage(subtreeMessages);
};

const createId = (prefix: string): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}${crypto.randomUUID()}`;
    }
    return `${prefix}${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const createLocalChatId = (): string => createId('local-chat-');
export const createLocalMessageId = (): string => createId('local-msg-');

export const getChatStorageSnapshot = (): ChatStorageSnapshot => {
    const state = readState();
    return {
        localChats: Object.values(state.localChats).map((record) => cloneChat(record.chat)),
        remoteDrafts: Object.values(state.remoteDrafts).map((record) => cloneChat(record.chat))
    };
};

export const subscribeChatStorage = (listener: () => void): (() => void) => {
    if (typeof window === 'undefined') {
        return () => undefined;
    }
    const handleStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) {
            listener();
        }
    };
    const handleChange = () => listener();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(CHANGE_EVENT, handleChange);
    };
};

export const getLocalChat = (chatId: string): StoredChatRecord | null => getRecord(readState().localChats, chatId);
export const getRemoteDraftChat = (chatId: string): StoredChatRecord | null => getRecord(readState().remoteDrafts, chatId);

export const getLocalChatBranch = (chatId: string, leafId?: string | null): WinkyChatMessage[] => {
    const record = getLocalChat(chatId);
    if (!record) {
        return [];
    }
    return getBranchFromLeaf(record.messages, leafId || record.chat.last_leaf_message_id);
};

export const getRemoteDraftBranch = (chatId: string, leafId?: string | null): WinkyChatMessage[] => {
    const record = getRemoteDraftChat(chatId);
    if (!record) {
        return [];
    }
    return getBranchFromLeaf(record.messages, leafId || record.chat.last_leaf_message_id);
};

export const getLocalMessageSiblings = (chatId: string, messageId: string): LocalSiblingsInfo | null => {
    const record = getLocalChat(chatId);
    if (!record) {
        return null;
    }
    const messages = mergeMessages(record.messages);
    const message = messages.find((item) => item.id === messageId);
    if (!message) {
        return null;
    }
    const siblings = messages.filter((item) => (item.parent_id || null) === (message.parent_id || null));
    return {
        items: siblings,
        total: siblings.length,
        currentIndex: Math.max(0, siblings.findIndex((item) => item.id === messageId))
    };
};

export const getLocalBranchFromMessage = (chatId: string, messageId: string): WinkyChatMessage[] => {
    const record = getLocalChat(chatId);
    if (!record) {
        return [];
    }
    const leaf = getLeafForSubtree(record.messages, messageId);
    return getBranchFromLeaf(record.messages, leaf?.id || messageId);
};

export const upsertLocalChat = (chat: WinkyChat, messages?: WinkyChatMessage[]): void => {
    updateState((state) => {
        const current = state.localChats[chat.id];
        state.localChats[chat.id] = {
            chat: {...current?.chat, ...chat},
            messages: mergeRecordMessages(current, messages)
        };
        return {...state};
    });
};

export const updateLocalChat = (chatId: string, updates: Partial<WinkyChat>): void => {
    updateState((state) => {
        const current = state.localChats[chatId];
        if (!current) {
            return state;
        }
        state.localChats[chatId] = {
            ...current,
            chat: {...current.chat, ...updates}
        };
        return {...state};
    });
};

export const deleteLocalChat = (chatId: string): void => {
    updateState((state) => {
        if (!state.localChats[chatId]) {
            return state;
        }
        delete state.localChats[chatId];
        return {...state};
    });
};

export const replaceLocalChatMessages = (chatId: string, messages: WinkyChatMessage[]): void => {
    updateState((state) => {
        const current = state.localChats[chatId];
        if (!current) {
            return state;
        }
        state.localChats[chatId] = {
            ...current,
            messages: mergeRecordMessages(current, messages)
        };
        return {...state};
    });
};

export const updateLocalChatMessage = (chatId: string, messageId: string, updates: Partial<WinkyChatMessage>): void => {
    updateState((state) => {
        const current = state.localChats[chatId];
        if (!current) {
            return state;
        }
        state.localChats[chatId] = {
            ...current,
            messages: current.messages.map((message) => (
                message.id === messageId ? {...message, ...updates} : message
            ))
        };
        return {...state};
    });
};

export const upsertRemoteDraft = (chat: WinkyChat, messages?: WinkyChatMessage[]): void => {
    updateState((state) => {
        const current = state.remoteDrafts[chat.id];
        state.remoteDrafts[chat.id] = {
            chat: {...current?.chat, ...chat},
            messages: messages ? mergeMessages(messages) : (current?.messages ?? [])
        };
        return {...state};
    });
};

export const updateRemoteDraft = (chatId: string, updates: Partial<WinkyChat>): void => {
    updateState((state) => {
        const current = state.remoteDrafts[chatId];
        if (!current) {
            return state;
        }
        state.remoteDrafts[chatId] = {
            ...current,
            chat: {...current.chat, ...updates}
        };
        return {...state};
    });
};

export const replaceRemoteDraftMessages = (chatId: string, messages: WinkyChatMessage[]): void => {
    updateState((state) => {
        const current = state.remoteDrafts[chatId];
        if (!current) {
            return state;
        }
        state.remoteDrafts[chatId] = {
            ...current,
            messages: mergeMessages(messages)
        };
        return {...state};
    });
};

export const updateRemoteDraftMessage = (
    chatId: string,
    messageId: string,
    updates: Partial<WinkyChatMessage>,
    nextMessageId?: string
): void => {
    updateState((state) => {
        const current = state.remoteDrafts[chatId];
        if (!current) {
            return state;
        }
        state.remoteDrafts[chatId] = {
            ...current,
            messages: current.messages.map((message) => {
                if (message.id !== messageId) {
                    return message;
                }
                return {
                    ...message,
                    ...updates,
                    id: nextMessageId || message.id
                };
            })
        };
        return {...state};
    });
};

export const clearRemoteDraft = (chatId: string): void => {
    updateState((state) => {
        if (!state.remoteDrafts[chatId]) {
            return state;
        }
        delete state.remoteDrafts[chatId];
        return {...state};
    });
};
