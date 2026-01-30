import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';

const STORAGE_KEY = 'winky_chat_panels';
const MAX_PANELS = 5;

export interface ChatPanelState {
    panelId: string;
    chatId: string;
    leafMessageId: string | null;
}

interface ChatPanelsContextType {
    panels: ChatPanelState[];
    maxPanels: number;
    canClosePanel: boolean;
    addPanel: (chatId: string) => string;
    removePanel: (panelId: string) => void;
    replacePanel: (panelId: string, newChatId: string) => void;
    reorderPanels: (fromIndex: number, toIndex: number) => void;
    insertPanelAt: (chatId: string, index: number) => string;
    updatePanelLeaf: (panelId: string, leafMessageId: string | null) => void;
    getPanelById: (panelId: string) => ChatPanelState | undefined;
    openSingleChat: (chatId: string) => void;
}

const ChatPanelsContext = createContext<ChatPanelsContextType | null>(null);

export const useChatPanels = (): ChatPanelsContextType => {
    const context = useContext(ChatPanelsContext);
    if (!context) {
        throw new Error('useChatPanels must be used within ChatPanelsProvider');
    }
    return context;
};

const generatePanelId = (): string => {
    return `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const loadPanelsFromStorage = (): ChatPanelState[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as ChatPanelState[];
        if (Array.isArray(parsed) && parsed.length > 0) {
            // Валидируем структуру
            const valid = parsed.filter(p =>
                p && typeof p.panelId === 'string' &&
                typeof p.chatId === 'string'
            );
            return valid.slice(0, MAX_PANELS);
        }
        return [];
    } catch {
        return [];
    }
};

const savePanelsToStorage = (panels: ChatPanelState[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
    } catch {
        // Ignore storage errors
    }
};

interface ChatPanelsProviderProps {
    children: React.ReactNode;
    initialChatId?: string;
}

export const ChatPanelsProvider: React.FC<ChatPanelsProviderProps> = ({children, initialChatId}) => {
    const initializedRef = useRef(false);

    const [panels, setPanels] = useState<ChatPanelState[]>(() => {
        // Загружаем из storage
        const stored = loadPanelsFromStorage();

        // Если есть сохранённые панели - используем их
        if (stored.length > 0) {
            initializedRef.current = true;
            return stored;
        }

        // Если нет сохранённых, но есть initialChatId - создаём одну панель
        if (initialChatId) {
            initializedRef.current = true;
            return [{panelId: generatePanelId(), chatId: initialChatId, leafMessageId: null}];
        }

        return [];
    });

    // Сохраняем в localStorage при изменении
    useEffect(() => {
        savePanelsToStorage(panels);
    }, [panels]);

    const canClosePanel = panels.length > 1;

    const addPanel = useCallback((chatId: string): string => {
        const newPanelId = generatePanelId();
        setPanels(prev => {
            if (prev.length >= MAX_PANELS) {
                // Заменяем последнюю панель
                const updated = [...prev];
                updated[updated.length - 1] = {panelId: newPanelId, chatId, leafMessageId: null};
                return updated;
            }
            return [...prev, {panelId: newPanelId, chatId, leafMessageId: null}];
        });
        return newPanelId;
    }, []);

    const removePanel = useCallback((panelId: string) => {
        setPanels(prev => {
            if (prev.length <= 1) return prev; // Не удаляем последнюю
            return prev.filter(p => p.panelId !== panelId);
        });
    }, []);

    const replacePanel = useCallback((panelId: string, newChatId: string) => {
        setPanels(prev => prev.map(p =>
            p.panelId === panelId
                ? {panelId: generatePanelId(), chatId: newChatId, leafMessageId: null}
                : p
        ));
    }, []);

    const reorderPanels = useCallback((fromIndex: number, toIndex: number) => {
        setPanels(prev => {
            if (fromIndex < 0 || fromIndex >= prev.length) return prev;
            if (toIndex < 0 || toIndex >= prev.length) return prev;
            if (fromIndex === toIndex) return prev;

            const updated = [...prev];
            const [moved] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, moved);
            return updated;
        });
    }, []);

    const insertPanelAt = useCallback((chatId: string, index: number): string => {
        const newPanelId = generatePanelId();
        setPanels(prev => {
            if (prev.length >= MAX_PANELS) {
                // Заменяем панель по индексу или последнюю
                const targetIndex = Math.min(index, prev.length - 1);
                const updated = [...prev];
                updated[targetIndex] = {panelId: newPanelId, chatId, leafMessageId: null};
                return updated;
            }
            const newPanel: ChatPanelState = {panelId: newPanelId, chatId, leafMessageId: null};
            const updated = [...prev];
            const insertIndex = Math.max(0, Math.min(index, prev.length));
            updated.splice(insertIndex, 0, newPanel);
            return updated;
        });
        return newPanelId;
    }, []);

    const updatePanelLeaf = useCallback((panelId: string, leafMessageId: string | null) => {
        setPanels(prev => prev.map(p =>
            p.panelId === panelId
                ? {...p, leafMessageId}
                : p
        ));
    }, []);

    const getPanelById = useCallback((panelId: string): ChatPanelState | undefined => {
        return panels.find(p => p.panelId === panelId);
    }, [panels]);

    const openSingleChat = useCallback((chatId: string) => {
        setPanels(prev => {
            // Если уже одна панель с этим же чатом - ничего не делаем
            if (prev.length === 1 && prev[0].chatId === chatId) {
                return prev;
            }
            // Если есть панели - оставляем первую и меняем её chatId
            if (prev.length > 0) {
                return [{...prev[0], chatId, leafMessageId: null}];
            }
            // Если панелей нет - создаём новую
            return [{panelId: generatePanelId(), chatId, leafMessageId: null}];
        });
    }, []);

    const value = useMemo(
        () => ({
            panels,
            maxPanels: MAX_PANELS,
            canClosePanel,
            addPanel,
            removePanel,
            replacePanel,
            reorderPanels,
            insertPanelAt,
            updatePanelLeaf,
            getPanelById,
            openSingleChat
        }),
        [panels, canClosePanel, addPanel, removePanel, replacePanel, reorderPanels, insertPanelAt, updatePanelLeaf, getPanelById, openSingleChat]
    );

    return <ChatPanelsContext.Provider value={value}>{children}</ChatPanelsContext.Provider>;
};
