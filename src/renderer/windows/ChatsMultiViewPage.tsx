import React, {useCallback, useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useTheme} from '@mui/material/styles';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {useChatPanels, ChatPanelsProvider} from '../features/chats/context/ChatPanelsContext';
import {ChatPanel} from '../features/chats/components/ChatPanel';
import {useChats} from '../context/ChatsContext';

interface SortablePanelProps {
    panelId: string;
    chatId: string;
    leafMessageId: string | null;
    canClose: boolean;
    showDragHandle: boolean;
    onLeafChange: (panelId: string, leafMessageId: string | null) => void;
    onClose: (panelId: string) => void;
    onChatCreated: (chatId: string, title: string) => void;
}

const SortablePanel: React.FC<SortablePanelProps> = ({
    panelId,
    chatId,
    leafMessageId,
    canClose,
    showDragHandle,
    onLeafChange,
    onClose,
    onChatCreated
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({id: panelId});

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        flex: 1,
        minWidth: 0
    };

    return (
        <div ref={setNodeRef} style={style} className="fc h-full">
            <ChatPanel
                panelId={panelId}
                chatId={chatId}
                initialLeafMessageId={leafMessageId}
                onLeafChange={onLeafChange}
                onClose={onClose}
                onChatCreated={onChatCreated}
                canClose={canClose}
                showDragHandle={showDragHandle}
                dragHandleProps={{...attributes, ...listeners}}
            />
        </div>
    );
};

const PanelDragOverlay: React.FC<{chatId: string}> = ({chatId}) => {
    const {chats} = useChats();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const chat = chats.find(c => c.id === chatId);
    const title = chat?.title || 'Chat';

    return (
        <div
            className="frcc rounded-lg px-4 py-2 shadow-xl"
            style={{
                backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                border: '2px solid #ec4899',
                minWidth: 150,
                maxWidth: 300
            }}
        >
            <span className="text-sm font-medium truncate">{title}</span>
        </div>
    );
};

const EmptyState: React.FC<{onSelectChat: () => void}> = ({onSelectChat}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <div
            className="fccc h-full gap-4 p-8 text-center"
            style={{backgroundColor: isDark ? 'transparent' : '#ffffff'}}
        >
            <div className="text-text-secondary">
                <p className="text-lg font-medium">No chat selected</p>
                <p className="text-sm mt-1">Select a chat from the sidebar</p>
            </div>
            <button
                onClick={onSelectChat}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    color: 'var(--color-text-primary)'
                }}
            >
                Select a chat
            </button>
        </div>
    );
};

const ChatsMultiViewContent: React.FC = () => {
    const navigate = useNavigate();
    const {panels, canClosePanel, removePanel, reorderPanels, updatePanelLeaf, addPanel, openSingleChat} = useChatPanels();
    const {chats} = useChats();

    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    // Слушаем события из сайдбара
    useEffect(() => {
        const handleOpenSingleChat = (event: CustomEvent<{chatId: string}>) => {
            const {chatId} = event.detail;
            if (chatId) {
                openSingleChat(chatId);
            }
        };

        const handleAddPanel = (event: CustomEvent<{chatId: string}>) => {
            const {chatId} = event.detail;
            if (chatId) {
                addPanel(chatId);
            }
        };

        window.addEventListener('chat-panels:open-single', handleOpenSingleChat as EventListener);
        window.addEventListener('chat-panels:add', handleAddPanel as EventListener);
        return () => {
            window.removeEventListener('chat-panels:open-single', handleOpenSingleChat as EventListener);
            window.removeEventListener('chat-panels:add', handleAddPanel as EventListener);
        };
    }, [openSingleChat, addPanel]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const id = event.active.id as string;
        setActiveId(id);
        const panel = panels.find(p => p.panelId === id);
        setActiveChatId(panel?.chatId || null);
    }, [panels]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const {active, over} = event;

        setActiveId(null);
        setActiveChatId(null);

        if (!over || active.id === over.id) return;

        const oldIndex = panels.findIndex(p => p.panelId === active.id);
        const newIndex = panels.findIndex(p => p.panelId === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            reorderPanels(oldIndex, newIndex);
        }
    }, [panels, reorderPanels]);

    const handleLeafChange = useCallback((panelId: string, leafMessageId: string | null) => {
        updatePanelLeaf(panelId, leafMessageId);
    }, [updatePanelLeaf]);

    const handlePanelClose = useCallback((panelId: string) => {
        removePanel(panelId);
    }, [removePanel]);

    const handleChatCreated = useCallback((newChatId: string, _title: string) => {
        navigate(`/chats/${newChatId}`, {replace: true});
    }, [navigate]);

    const handleSelectChat = useCallback(() => {
        if (chats.length > 0) {
            navigate(`/chats/${chats[0].id}`);
        }
    }, [chats, navigate]);

    const showDragHandles = panels.length > 1;

    if (panels.length === 0) {
        return (
            <div className="h-full w-full">
                <EmptyState onSelectChat={handleSelectChat}/>
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-hidden">
            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={panels.map(p => p.panelId)}
                    strategy={horizontalListSortingStrategy}
                >
                    <div className="fr h-full w-full overflow-hidden">
                        {panels.map((panel) => (
                            <SortablePanel
                                key={panel.panelId}
                                panelId={panel.panelId}
                                chatId={panel.chatId}
                                leafMessageId={panel.leafMessageId}
                                canClose={canClosePanel}
                                showDragHandle={showDragHandles}
                                onLeafChange={handleLeafChange}
                                onClose={handlePanelClose}
                                onChatCreated={handleChatCreated}
                            />
                        ))}
                    </div>
                </SortableContext>

                <DragOverlay>
                    {activeChatId ? <PanelDragOverlay chatId={activeChatId}/> : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
};

const ChatsMultiViewPage: React.FC = () => {
    const {chatId} = useParams<{chatId?: string}>();

    return (
        <ChatPanelsProvider initialChatId={chatId && chatId !== 'new' ? chatId : undefined}>
            <ChatsMultiViewContent/>
        </ChatPanelsProvider>
    );
};

export default ChatsMultiViewPage;
