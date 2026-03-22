import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import type {WinkyChat} from '@shared/types';
import {useConfig} from './ConfigContext';
import {useUser} from './UserContext';
import {fetchWinkyChats, deleteWinkyChat as deleteWinkyChatApi} from '../services/winkyAiApi';
import {
    deleteLocalChat as deleteLocalChatRecord,
    getChatStorageSnapshot,
    subscribeChatStorage,
    updateLocalChat as updateLocalChatRecord,
    upsertLocalChat as upsertLocalChatRecord
} from '../features/chats/services/chatStorage';
import {getChatModelPreference, removeChatModelPreference, setChatModelPreference} from '../features/chats/services/chatModelPreferences';

interface ChatsContextType {
    chats: WinkyChat[];
    loading: boolean;
    error: string | null;
    refreshChats: () => Promise<void>;
    addChat: (chat: WinkyChat) => void;
    updateChat: (chatId: string, updates: Partial<WinkyChat>) => void;
    deleteChat: (chatId: string) => Promise<void>;
}

const ChatsContext = createContext<ChatsContextType | null>(null);

export const useChats = (): ChatsContextType => {
    const context = useContext(ChatsContext);
    if (!context) {
        throw new Error('useChats must be used within ChatsProvider');
    }
    return context;
};

interface ChatsProviderProps {
    children: React.ReactNode;
}

const sortChats = (items: WinkyChat[]): WinkyChat[] => [...items].sort((left, right) => {
    const leftPinned = Boolean(left.pinned_at);
    const rightPinned = Boolean(right.pinned_at);
    if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
    }
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
});

const areChatsEqual = (left: WinkyChat[], right: WinkyChat[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftChat = left[index];
        const rightChat = right[index];
        if (
            leftChat.id !== rightChat.id ||
            leftChat.title !== rightChat.title ||
            leftChat.updated_at !== rightChat.updated_at ||
            leftChat.created_at !== rightChat.created_at ||
            leftChat.message_count !== rightChat.message_count ||
            leftChat.last_leaf_message_id !== rightChat.last_leaf_message_id ||
            leftChat.pinned_at !== rightChat.pinned_at ||
            leftChat.storage !== rightChat.storage ||
            leftChat.provider !== rightChat.provider ||
            leftChat.model_name !== rightChat.model_name ||
            leftChat.llm_mode !== rightChat.llm_mode ||
            leftChat.additional_context !== rightChat.additional_context
        ) {
            return false;
        }
    }
    return true;
};

export const ChatsProvider: React.FC<ChatsProviderProps> = ({children}) => {
    const {config} = useConfig();
    const {user} = useUser();
    const [remoteChats, setRemoteChats] = useState<WinkyChat[]>([]);
    const [localChats, setLocalChats] = useState<WinkyChat[]>([]);
    const [remoteDraftChats, setRemoteDraftChats] = useState<WinkyChat[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    const accessToken = config?.auth?.access || config?.auth?.accessToken || '';
    const isAuthenticated = Boolean(user) && Boolean(accessToken);

    const syncStoredChats = useCallback(() => {
        const snapshot = getChatStorageSnapshot();
        const nextLocalChats = sortChats(snapshot.localChats);
        const nextRemoteDraftChats = sortChats(snapshot.remoteDrafts);
        setLocalChats((prev) => areChatsEqual(prev, nextLocalChats) ? prev : nextLocalChats);
        setRemoteDraftChats((prev) => areChatsEqual(prev, nextRemoteDraftChats) ? prev : nextRemoteDraftChats);
    }, []);

    const refreshChats = useCallback(async () => {
        if (!accessToken) {
            setRemoteChats([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetchWinkyChats(accessToken, 1, 100);
            setRemoteChats(sortChats(response.items.map((chat) => {
                const preference = getChatModelPreference(chat.id);
                return {
                    ...chat,
                    storage: 'remote',
                    provider: 'winky',
                    model_name: preference?.model_name || chat.model_name || null,
                    llm_mode: preference?.llm_mode || chat.llm_mode || null
                };
            })));
        } catch (err: any) {
            console.error('[ChatsContext] Failed to fetch chats:', err);
            setError(err?.message || 'Failed to load chats');
        } finally {
            setLoading(false);
        }
    }, [accessToken]);

    useEffect(() => {
        syncStoredChats();
        return subscribeChatStorage(syncStoredChats);
    }, [syncStoredChats]);

    useEffect(() => {
        if (!isAuthenticated) {
            setRemoteChats([]);
            fetchedRef.current = false;
            return;
        }

        if (fetchedRef.current) return;
        fetchedRef.current = true;

        void refreshChats();
    }, [isAuthenticated, refreshChats]);

    const addChat = useCallback((chat: WinkyChat) => {
        if (chat.storage === 'local') {
            upsertLocalChatRecord(chat);
            return;
        }
        if (chat.model_name || chat.llm_mode) {
            setChatModelPreference(chat.id, {
                provider: chat.provider,
                model_name: chat.model_name,
                llm_mode: chat.llm_mode
            });
        }
        setRemoteChats((prev) => sortChats([chat, ...prev.filter((item) => item.id !== chat.id)]));
    }, []);

    const updateChat = useCallback((chatId: string, updates: Partial<WinkyChat>) => {
        const localChat = localChats.find((chat) => chat.id === chatId);
        if (localChat || updates.storage === 'local') {
            updateLocalChatRecord(chatId, updates);
            return;
        }
        if (updates.model_name || updates.llm_mode || updates.provider) {
            setChatModelPreference(chatId, {
                provider: updates.provider,
                model_name: updates.model_name,
                llm_mode: updates.llm_mode
            });
        }
        setRemoteChats((prev) => sortChats(prev.map((chat) => (chat.id === chatId ? {...chat, ...updates} : chat))));
    }, [localChats]);

    const deleteChat = useCallback(async (chatId: string) => {
        if (localChats.some((chat) => chat.id === chatId)) {
            deleteLocalChatRecord(chatId);
            return;
        }
        if (!accessToken) return;

        await deleteWinkyChatApi(chatId, accessToken);
        removeChatModelPreference(chatId);
        setRemoteChats((prev) => prev.filter((chat) => chat.id !== chatId));
    }, [accessToken, localChats]);

    const chats = useMemo(() => {
        const remoteIds = new Set(remoteChats.map((chat) => chat.id));
        const draftFallbacks = remoteDraftChats.filter((chat) => !remoteIds.has(chat.id));
        return sortChats([...remoteChats, ...draftFallbacks, ...localChats]);
    }, [localChats, remoteChats, remoteDraftChats]);

    const value = useMemo(
        () => ({
            chats,
            loading,
            error,
            refreshChats,
            addChat,
            updateChat,
            deleteChat
        }),
        [chats, loading, error, refreshChats, addChat, updateChat, deleteChat]
    );

    return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
};
