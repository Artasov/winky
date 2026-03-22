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

const generatePanelId = (): string => `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const loadPanelsFromStorage = (): ChatPanelState[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as ChatPanelState[];
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return [];
        }
        return parsed
            .filter((panel) => panel && typeof panel.panelId === 'string' && typeof panel.chatId === 'string')
            .slice(0, MAX_PANELS);
    } catch {
        return [];
    }
};

const savePanelsToStorage = (panels: ChatPanelState[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
        window.dispatchEvent(new CustomEvent('chat-panels:changed'));
    } catch {
        // Ignore storage errors.
    }
};

interface ChatPanelsProviderProps {
    children: React.ReactNode;
    initialChatId?: string;
}

export const ChatPanelsProvider: React.FC<ChatPanelsProviderProps> = ({children, initialChatId}) => {
    const routedChatIdRef = useRef<string | undefined>(undefined);

    const [panels, setPanels] = useState<ChatPanelState[]>(() => {
        if (initialChatId) {
            return [{panelId: generatePanelId(), chatId: initialChatId, leafMessageId: null}];
        }
        return loadPanelsFromStorage();
    });

    useEffect(() => {
        savePanelsToStorage(panels);
    }, [panels]);

    const canClosePanel = panels.length > 1;

    const addPanel = useCallback((chatId: string): string => {
        const newPanelId = generatePanelId();
        setPanels((prev) => {
            if (prev.length >= MAX_PANELS) {
                const updated = [...prev];
                updated[updated.length - 1] = {panelId: newPanelId, chatId, leafMessageId: null};
                return updated;
            }
            return [...prev, {panelId: newPanelId, chatId, leafMessageId: null}];
        });
        return newPanelId;
    }, []);

    const removePanel = useCallback((panelId: string) => {
        setPanels((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((panel) => panel.panelId !== panelId);
        });
    }, []);

    const replacePanel = useCallback((panelId: string, newChatId: string) => {
        setPanels((prev) => prev.map((panel) => (
            panel.panelId === panelId
                ? {panelId: generatePanelId(), chatId: newChatId, leafMessageId: null}
                : panel
        )));
    }, []);

    const reorderPanels = useCallback((fromIndex: number, toIndex: number) => {
        setPanels((prev) => {
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
        setPanels((prev) => {
            if (prev.length >= MAX_PANELS) {
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
        setPanels((prev) => prev.map((panel) => (
            panel.panelId === panelId ? {...panel, leafMessageId} : panel
        )));
    }, []);

    const getPanelById = useCallback((panelId: string): ChatPanelState | undefined => {
        return panels.find((panel) => panel.panelId === panelId);
    }, [panels]);

    const openSingleChat = useCallback((chatId: string) => {
        setPanels((prev) => {
            if (prev.length === 1 && prev[0].chatId === chatId) {
                return prev;
            }
            if (prev.length > 0) {
                return [{...prev[0], chatId, leafMessageId: null}];
            }
            return [{panelId: generatePanelId(), chatId, leafMessageId: null}];
        });
    }, []);

    useEffect(() => {
        if (!initialChatId || routedChatIdRef.current === initialChatId) {
            return;
        }
        routedChatIdRef.current = initialChatId;
        openSingleChat(initialChatId);
    }, [initialChatId, openSingleChat]);

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
