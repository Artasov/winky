import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import type {WinkyChat} from '@shared/types';
import {useConfig} from './ConfigContext';
import {useUser} from './UserContext';
import {fetchWinkyChats, deleteWinkyChat as deleteWinkyChatApi} from '../services/winkyAiApi';

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

export const ChatsProvider: React.FC<ChatsProviderProps> = ({children}) => {
    const {config} = useConfig();
    const {user} = useUser();
    const [chats, setChats] = useState<WinkyChat[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    const accessToken = config?.auth?.access || config?.auth?.accessToken || '';
    const isAuthenticated = Boolean(user) && Boolean(accessToken);

    const refreshChats = useCallback(async () => {
        if (!accessToken) return;

        setLoading(true);
        setError(null);

        try {
            // Загружаем все чаты (до 100 за раз)
            const response = await fetchWinkyChats(accessToken, 1, 100);
            setChats(response.items);
        } catch (err: any) {
            console.error('[ChatsContext] Failed to fetch chats:', err);
            setError(err?.message || 'Failed to load chats');
        } finally {
            setLoading(false);
        }
    }, [accessToken]);

    // Автоматическая загрузка чатов при авторизации
    useEffect(() => {
        if (!isAuthenticated) {
            setChats([]);
            fetchedRef.current = false;
            return;
        }

        if (fetchedRef.current) return;
        fetchedRef.current = true;

        void refreshChats();
    }, [isAuthenticated, refreshChats]);

    const addChat = useCallback((chat: WinkyChat) => {
        setChats((prev) => [chat, ...prev]);
    }, []);

    const updateChat = useCallback((chatId: string, updates: Partial<WinkyChat>) => {
        setChats((prev) =>
            prev.map((chat) =>
                chat.id === chatId ? {...chat, ...updates} : chat
            )
        );
    }, []);

    const deleteChat = useCallback(async (chatId: string) => {
        if (!accessToken) return;

        await deleteWinkyChatApi(chatId, accessToken);
        setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    }, [accessToken]);

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
