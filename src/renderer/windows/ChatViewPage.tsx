import React, {useCallback, useEffect, useRef, useState, memo} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {alpha, useTheme} from '@mui/material/styles';
import {CircularProgress, IconButton, TextField} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import type {WinkyChatMessage, MessageChildrenResponse} from '@shared/types';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import {useChats} from '../context/ChatsContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ChatActions from '../features/chats/components/ChatActions';
import ChatMessage from '../features/chats/components/ChatMessage';
import {
    fetchWinkyChatBranch,
    fetchWinkyChat,
    fetchMessageChildren,
    fetchMessageBranch,
    winkyLLMStream,
    winkyTranscribe,
    updateWinkyChat
} from '../services/winkyAiApi';

const CHAT_BRANCHES_STORAGE_KEY = 'winky_chat_branches';

const getStoredLeafMessageId = (chatId: string): string | null => {
    try {
        const stored = localStorage.getItem(CHAT_BRANCHES_STORAGE_KEY);
        if (!stored) return null;
        const branches = JSON.parse(stored) as Record<string, string>;
        return branches[chatId] || null;
    } catch {
        return null;
    }
};

const saveLeafMessageId = (chatId: string, leafMessageId: string | null) => {
    try {
        const stored = localStorage.getItem(CHAT_BRANCHES_STORAGE_KEY);
        const branches = stored ? JSON.parse(stored) as Record<string, string> : {};
        if (leafMessageId) {
            branches[chatId] = leafMessageId;
        } else {
            delete branches[chatId];
        }
        localStorage.setItem(CHAT_BRANCHES_STORAGE_KEY, JSON.stringify(branches));
    } catch {
        // Ignore storage errors
    }
};

interface MicWavesProps {
    isRecording: boolean;
    normalizedVolume: number;
}

const MicWavesComponent: React.FC<MicWavesProps> = ({isRecording, normalizedVolume}) => {
    const ringMultipliers = [2, 1];
    const buttonSize = 40;
    const firstRingSize = buttonSize + 4;
    const amplifiedVolume = Math.min(1, normalizedVolume * 5);
    const sqrtVolume = Math.sqrt(amplifiedVolume);
    const baseWaveScale = 1.02;
    const maxAdditionalScale = 0.25;
    const waveScale = baseWaveScale + sqrtVolume * maxAdditionalScale;
    const minVolumeThreshold = 0.02;

    if (!isRecording) return null;

    const roseColor = '225, 29, 72';

    return (
        <div
            className="pointer-events-none absolute flex items-center justify-center"
            style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '80px',
                height: '80px',
                zIndex: 0
            }}
        >
            {ringMultipliers.map((multiplier) => (
                <div
                    key={multiplier}
                    className="absolute rounded-full"
                    style={{
                        width: `${firstRingSize + (multiplier - 1) * 12}px`,
                        height: `${firstRingSize + (multiplier - 1) * 12}px`,
                        border: `2px solid rgba(${roseColor}, ${0.6 - (multiplier - 1) * 0.2})`,
                        opacity: amplifiedVolume > minVolumeThreshold
                            ? Math.min(1, (amplifiedVolume - minVolumeThreshold) * 1.5 - (multiplier - 1) * 0.2)
                            : 0,
                        transform: `scale(${waveScale * (1 - (multiplier - 1) * 0.08)})`,
                        boxShadow: `0 0 ${4 + sqrtVolume * 6}px ${1 + sqrtVolume * 3}px rgba(${roseColor}, ${0.15 + sqrtVolume * 0.2})`,
                        transition: 'opacity 0.75s ease-out, transform 0.75s ease-out'
                    }}
                />
            ))}
        </div>
    );
};

const MicWaves = React.memo(MicWavesComponent);

interface MessagesListProps {
    messages: WinkyChatMessage[];
    streamingContent: string;
    loading: boolean;
    loadingMore: boolean;
    editingMessageId: string | null;
    editText: string;
    siblingsData: Map<string, {items: WinkyChatMessage[]; total: number; currentIndex: number}>;
    switchingBranchAtMessageId: string | null;
    onEditStart: (message: WinkyChatMessage) => void;
    onEditChange: (text: string) => void;
    onEditSubmit: () => void;
    onEditCancel: () => void;
    onSiblingNavigate: (message: WinkyChatMessage, direction: 'prev' | 'next') => void;
}

const MessagesListComponent: React.FC<MessagesListProps> = ({
    messages,
    streamingContent,
    loading,
    loadingMore,
    editingMessageId,
    editText,
    siblingsData,
    switchingBranchAtMessageId,
    onEditStart,
    onEditChange,
    onEditSubmit,
    onEditCancel,
    onSiblingNavigate
}) => {
    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="medium"/>
            </div>
        );
    }

    if (messages.length === 0 && !streamingContent) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center text-text-secondary">
                    <p>No messages yet.</p>
                    <p className="text-sm mt-1">Start the conversation below.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fc gap-4">
            {loadingMore && (
                <div className="flex justify-center py-2">
                    <CircularProgress size={20}/>
                </div>
            )}

            {messages.map((message) => {
                const siblingInfo = siblingsData.get(message.id);
                const isEditing = editingMessageId === message.id;
                const isSwitchingBranch = switchingBranchAtMessageId === message.id;

                // Показываем навигатор если есть siblings (из siblingsData или из sibling_count с backend)
                const mayHaveSiblings = siblingInfo
                    ? siblingInfo.total > 1
                    : (message.sibling_count > 0);

                // Используем данные из siblingsData если есть, иначе из message (с backend)
                const currentIndex = siblingInfo?.currentIndex ?? message.sibling_index;
                const totalSiblings = siblingInfo?.total ?? (message.sibling_count + 1);

                return (
                    <React.Fragment key={message.id}>
                        <ChatMessage
                            message={message}
                            isEditing={isEditing}
                            editText={isEditing ? editText : undefined}
                            onEditStart={onEditStart}
                            onEditChange={onEditChange}
                            onEditSubmit={onEditSubmit}
                            onEditCancel={onEditCancel}
                            siblingIndex={mayHaveSiblings ? currentIndex : undefined}
                            siblingsTotal={mayHaveSiblings ? totalSiblings : undefined}
                            onSiblingPrev={mayHaveSiblings ? () => onSiblingNavigate(message, 'prev') : undefined}
                            onSiblingNext={mayHaveSiblings ? () => onSiblingNavigate(message, 'next') : undefined}
                            navigatorDisabled={!!switchingBranchAtMessageId}
                        />
                        {isSwitchingBranch && (
                            <div className="flex justify-center py-4">
                                <CircularProgress size={24}/>
                            </div>
                        )}
                    </React.Fragment>
                );
            })}

            {streamingContent && (
                <ChatMessage
                    message={{
                        id: 'streaming',
                        parent_id: null,
                        role: 'assistant',
                        content: streamingContent,
                        model_level: 'high',
                        tokens: 0,
                        has_children: false,
                        sibling_count: 0,
                        sibling_index: 0,
                        created_at: new Date().toISOString()
                    }}
                    isStreaming
                />
            )}
        </div>
    );
};

const MessagesList = memo(MessagesListComponent);

const ChatViewPage: React.FC = () => {
    const {chatId} = useParams<{chatId: string}>();
    const isNewChat = chatId === 'new';
    const navigate = useNavigate();
    const {showToast} = useToast();
    const {config} = useConfig();
    const {addChat, updateChat: updateChatInContext, deleteChat: deleteChatFromContext} = useChats();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.12);

    const [currentBranch, setCurrentBranch] = useState<WinkyChatMessage[]>([]);
    const [loading, setLoading] = useState(!isNewChat);
    const [sending, setSending] = useState(false);
    const [inputText, setInputText] = useState('');
    const [streamingContent, setStreamingContent] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [currentChatId, setCurrentChatId] = useState<string | null>(isNewChat ? null : chatId || null);
    const [normalizedVolume, setNormalizedVolume] = useState(0);
    const [chatTitle, setChatTitle] = useState('');

    const [leafMessageId, setLeafMessageId] = useState<string | null>(null);
    const [hasMoreMessages, setHasMoreMessages] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    const [siblingsData, setSiblingsData] = useState<Map<string, {items: WinkyChatMessage[]; total: number; currentIndex: number}>>(new Map());
    const [switchingBranchAtMessageId, setSwitchingBranchAtMessageId] = useState<string | null>(null);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const scrollHeightBeforeLoad = useRef<number>(0);
    const skipNextScrollToBottom = useRef<boolean>(false);

    const accessToken = config?.auth?.access || config?.auth?.accessToken || '';

    const scrollToBottom = useCallback(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, []);

    const loadBranch = useCallback(async (leafId?: string, cursor?: string) => {
        if (!accessToken || !currentChatId) return;

        const isLoadingMore = !!cursor;
        if (isLoadingMore) {
            setLoadingMore(true);
            scrollHeightBeforeLoad.current = messagesContainerRef.current?.scrollHeight || 0;
        }

        try {
            const response = await fetchWinkyChatBranch(currentChatId, accessToken, {
                leafMessageId: leafId,
                cursor,
                limit: 20
            });

            if (isLoadingMore) {
                setCurrentBranch(prev => [...response.items, ...prev]);
                requestAnimationFrame(() => {
                    const container = messagesContainerRef.current;
                    if (container) {
                        const newScrollHeight = container.scrollHeight;
                        container.scrollTop = newScrollHeight - scrollHeightBeforeLoad.current;
                    }
                });
            } else {
                setCurrentBranch(response.items);
                setLeafMessageId(response.leaf_message_id);
            }

            setHasMoreMessages(response.has_more);
            setNextCursor(response.next_cursor);
        } catch (error) {
            console.error('[ChatViewPage] Failed to load branch', error);
            if (!isLoadingMore) {
                showToast('Failed to load messages.', 'error');
            }
        } finally {
            if (isLoadingMore) {
                setLoadingMore(false);
            }
        }
    }, [accessToken, currentChatId, showToast]);

    const loadMessages = useCallback(async () => {
        if (!accessToken || !chatId || isNewChat) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const chatResponse = await fetchWinkyChat(chatId, accessToken);
            setChatTitle(chatResponse.title || '');
            setCurrentChatId(chatId);

            // Приоритет: локально сохранённая ветка > последняя ветка с backend
            const storedLeafId = getStoredLeafMessageId(chatId);
            const leafToLoad = storedLeafId || chatResponse.last_leaf_message_id || undefined;

            const branchResponse = await fetchWinkyChatBranch(chatId, accessToken, {
                leafMessageId: leafToLoad,
                limit: 20
            });

            setCurrentBranch(branchResponse.items);
            setLeafMessageId(branchResponse.leaf_message_id);
            setHasMoreMessages(branchResponse.has_more);
            setNextCursor(branchResponse.next_cursor);

            // Сохраняем текущую ветку локально
            if (branchResponse.leaf_message_id) {
                saveLeafMessageId(chatId, branchResponse.leaf_message_id);
            }
        } catch (error) {
            console.error('[ChatViewPage] Failed to load messages', error);
            showToast('Failed to load messages.', 'error');
        } finally {
            setLoading(false);
        }
    }, [accessToken, chatId, isNewChat, showToast]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useEffect(() => {
        // Не скроллим при загрузке старых сообщений или при переключении веток
        if (skipNextScrollToBottom.current) {
            skipNextScrollToBottom.current = false;
            return;
        }
        if (!loadingMore && !switchingBranchAtMessageId) {
            scrollToBottom();
        }
    }, [currentBranch, streamingContent, scrollToBottom, loadingMore, switchingBranchAtMessageId]);

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
            }
        };
    }, []);

    const handleScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container || loadingMore || !hasMoreMessages || !nextCursor) return;

        if (container.scrollTop < 100) {
            void loadBranch(leafMessageId || undefined, nextCursor);
        }
    }, [loadingMore, hasMoreMessages, nextCursor, leafMessageId, loadBranch]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    const handleEditStart = useCallback((message: WinkyChatMessage) => {
        setEditingMessageId(message.id);
        setEditText(message.content);
    }, []);

    const handleEditChange = useCallback((text: string) => {
        setEditText(text);
    }, []);

    const handleEditCancel = useCallback(() => {
        setEditingMessageId(null);
        setEditText('');
    }, []);

    const handleEditSubmit = useCallback(async () => {
        const text = editText.trim();
        if (!text || !accessToken || sending || !editingMessageId) return;

        const editingMessage = currentBranch.find(m => m.id === editingMessageId);
        if (!editingMessage) return;

        const parentMessageId = editingMessage.parent_id;

        setSending(true);
        setEditingMessageId(null);
        setEditText('');
        setStreamingContent('');

        const tempUserMessage: WinkyChatMessage = {
            id: `temp-user-${Date.now()}`,
            parent_id: parentMessageId,
            role: 'user',
            content: text,
            model_level: 'high',
            tokens: 0,
            has_children: false,
            sibling_count: 0,
            sibling_index: 0,
            created_at: new Date().toISOString()
        };

        const editingIndex = currentBranch.findIndex(m => m.id === editingMessageId);
        const messagesBeforeEdit = editingIndex > 0 ? currentBranch.slice(0, editingIndex) : [];
        setCurrentBranch([...messagesBeforeEdit, tempUserMessage]);

        try {
            const result = await winkyLLMStream(
                {
                    prompt: text,
                    model_level: 'high',
                    chat_id: currentChatId || undefined,
                    parent_message_id: parentMessageId
                },
                accessToken,
                (chunk) => {
                    setStreamingContent((prev) => prev + chunk);
                }
            );

            if (!currentChatId && result.chat_id) {
                setCurrentChatId(result.chat_id);
                navigate(`/chats/${result.chat_id}`, {replace: true});
                addChat({
                    id: result.chat_id,
                    title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
                    additional_context: '',
                    message_count: 2,
                    last_leaf_message_id: result.assistant_message_id,
                    pinned_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }

            const userMessage: WinkyChatMessage = {
                id: result.user_message_id,
                parent_id: parentMessageId,
                role: 'user',
                content: text,
                model_level: 'high',
                tokens: 0,
                has_children: true,
                sibling_count: 1,
                sibling_index: 1,
                created_at: new Date().toISOString()
            };

            const assistantMessage: WinkyChatMessage = {
                id: result.assistant_message_id,
                parent_id: result.user_message_id,
                role: 'assistant',
                content: result.content,
                model_level: result.model_level,
                tokens: 0,
                has_children: false,
                sibling_count: 0,
                sibling_index: 0,
                created_at: new Date().toISOString()
            };

            setCurrentBranch([...messagesBeforeEdit, userMessage, assistantMessage]);
            setLeafMessageId(result.assistant_message_id);
            setStreamingContent('');

            // Сохраняем ветку локально
            const chatIdToSave = currentChatId || result.chat_id;
            if (chatIdToSave) {
                saveLeafMessageId(chatIdToSave, result.assistant_message_id);
            }

            // Загружаем siblings для нового сообщения чтобы показать навигатор
            if (parentMessageId) {
                const siblingsResponse = await loadSiblings(parentMessageId);
                if (siblingsResponse && siblingsResponse.total > 1) {
                    setSiblingsData(prev => {
                        const newMap = new Map(prev);
                        siblingsResponse.items.forEach((item, idx) => {
                            newMap.set(item.id, {
                                items: siblingsResponse.items,
                                total: siblingsResponse.total,
                                currentIndex: idx
                            });
                        });
                        return newMap;
                    });
                }
            }
        } catch (error: any) {
            console.error('[ChatViewPage] Failed to send edited message', error);
            setCurrentBranch(currentBranch);

            if (error?.response?.status === 402) {
                showToast('Not enough credits. Top up your balance.', 'error');
            } else {
                showToast(error?.message || 'Failed to send message.', 'error');
            }
        } finally {
            setSending(false);
            setStreamingContent('');
        }
    }, [editText, accessToken, sending, editingMessageId, currentBranch, currentChatId, navigate, showToast, addChat]);

    const loadSiblings = useCallback(async (parentId: string): Promise<MessageChildrenResponse | null> => {
        if (!accessToken) return null;

        try {
            const response = await fetchMessageChildren(parentId, accessToken);
            return response;
        } catch (error) {
            console.error('[ChatViewPage] Failed to load siblings', error);
            return null;
        }
    }, [accessToken]);

    const handleSiblingNavigate = useCallback(async (message: WinkyChatMessage, direction: 'prev' | 'next') => {
        if (!message.parent_id) return;

        let siblingInfo = siblingsData.get(message.id);

        if (!siblingInfo) {
            const response = await loadSiblings(message.parent_id);
            if (!response) return;

            const currentIndex = response.items.findIndex(m => m.id === message.id);
            siblingInfo = {
                items: response.items,
                total: response.total,
                currentIndex: currentIndex >= 0 ? currentIndex : 0
            };

            // Сохраняем siblingsData даже если total = 1, чтобы скрыть навигатор
            setSiblingsData(prev => {
                const newMap = new Map(prev);
                response.items.forEach((item, idx) => {
                    newMap.set(item.id, {
                        items: response.items,
                        total: response.total,
                        currentIndex: idx
                    });
                });
                return newMap;
            });

            // Если только один sibling - выходим после сохранения данных
            if (response.items.length <= 1) return;
        }

        const newIndex = direction === 'prev'
            ? siblingInfo.currentIndex - 1
            : siblingInfo.currentIndex + 1;

        if (newIndex < 0 || newIndex >= siblingInfo.items.length) return;

        const newMessage = siblingInfo.items[newIndex];

        const messageIndex = currentBranch.findIndex(m => m.id === message.id);
        if (messageIndex < 0) return;

        // Сохраняем оригинальную ветку для восстановления при ошибке
        const originalBranch = [...currentBranch];

        // Сохраняем позицию скролла относительно контейнера
        const container = messagesContainerRef.current;
        const scrollTopBefore = container?.scrollTop || 0;

        // Оставляем сообщение с которого переключаемся, убираем только то что ниже
        const messagesUpToSwitch = currentBranch.slice(0, messageIndex + 1);
        setCurrentBranch(messagesUpToSwitch);

        // Показываем индикатор под сообщением с которого переключаемся
        setSwitchingBranchAtMessageId(message.id);

        try {
            // Используем fetchMessageBranch который строит полную ветку через сообщение до leaf
            const branchResponse = await fetchMessageBranch(newMessage.id, accessToken);

            // Берем сообщения ДО переключаемого (без него самого)
            const messagesBeforeSwitch = currentBranch.slice(0, messageIndex);
            const existingIds = new Set(messagesBeforeSwitch.map(m => m.id));
            const newBranchFromSwitch = branchResponse.items.filter(m => !existingIds.has(m.id));

            const newFullBranch = [...messagesBeforeSwitch, ...newBranchFromSwitch];
            setCurrentBranch(newFullBranch);

            // Восстанавливаем позицию скролла и снимаем флаг загрузки
            requestAnimationFrame(() => {
                if (container) {
                    container.scrollTop = scrollTopBefore;
                }
                skipNextScrollToBottom.current = true;
                setSwitchingBranchAtMessageId(null);
            });

            // Обновляем leaf - последнее сообщение в новой ветке
            const lastMessage = newBranchFromSwitch[newBranchFromSwitch.length - 1];
            if (lastMessage) {
                setLeafMessageId(lastMessage.id);
                // Сохраняем выбранную ветку локально
                if (currentChatId) {
                    saveLeafMessageId(currentChatId, lastMessage.id);
                }
            }

            // Обновляем siblingsData - новое сообщение теперь текущее
            if (siblingInfo) {
                const siblingsToUpdate = siblingInfo;
                setSiblingsData(prev => {
                    const newMap = new Map(prev);
                    siblingsToUpdate.items.forEach((item, idx) => {
                        newMap.set(item.id, {
                            items: siblingsToUpdate.items,
                            total: siblingsToUpdate.total,
                            currentIndex: idx
                        });
                    });
                    return newMap;
                });
            }

            // Сбрасываем пагинацию
            setHasMoreMessages(false);
            setNextCursor(null);
        } catch (error) {
            console.error('[ChatViewPage] Failed to switch branch', error);
            showToast('Failed to switch branch.', 'error');
            // Восстанавливаем оригинальную ветку при ошибке
            setCurrentBranch(originalBranch);
            setSwitchingBranchAtMessageId(null);
        }
    }, [siblingsData, loadSiblings, currentBranch, currentChatId, accessToken, showToast]);

    const handleSendMessage = useCallback(async () => {
        const text = inputText.trim();
        if (!text || !accessToken || sending) return;

        setSending(true);
        setInputText('');
        setStreamingContent('');

        const lastMessage = currentBranch.length > 0 ? currentBranch[currentBranch.length - 1] : null;
        const parentMessageId = lastMessage?.id || null;

        const tempUserMessage: WinkyChatMessage = {
            id: `temp-user-${Date.now()}`,
            parent_id: parentMessageId,
            role: 'user',
            content: text,
            model_level: 'high',
            tokens: 0,
            has_children: false,
            sibling_count: 0,
            sibling_index: 0,
            created_at: new Date().toISOString()
        };

        setCurrentBranch((prev) => [...prev, tempUserMessage]);

        try {
            const result = await winkyLLMStream(
                {
                    prompt: text,
                    model_level: 'high',
                    chat_id: currentChatId || undefined,
                    parent_message_id: parentMessageId
                },
                accessToken,
                (chunk) => {
                    setStreamingContent((prev) => prev + chunk);
                }
            );

            if (!currentChatId && result.chat_id) {
                setCurrentChatId(result.chat_id);
                navigate(`/chats/${result.chat_id}`, {replace: true});
                addChat({
                    id: result.chat_id,
                    title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
                    additional_context: '',
                    message_count: 2,
                    last_leaf_message_id: result.assistant_message_id,
                    pinned_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }

            const userMessage: WinkyChatMessage = {
                id: result.user_message_id,
                parent_id: parentMessageId,
                role: 'user',
                content: text,
                model_level: 'high',
                tokens: 0,
                has_children: true,
                sibling_count: 0,
                sibling_index: 0,
                created_at: new Date().toISOString()
            };

            const assistantMessage: WinkyChatMessage = {
                id: result.assistant_message_id,
                parent_id: result.user_message_id,
                role: 'assistant',
                content: result.content,
                model_level: result.model_level,
                tokens: 0,
                has_children: false,
                sibling_count: 0,
                sibling_index: 0,
                created_at: new Date().toISOString()
            };

            setCurrentBranch((prev) => {
                const filtered = prev.filter((m) => !m.id.startsWith('temp-'));
                return [...filtered, userMessage, assistantMessage];
            });

            setLeafMessageId(result.assistant_message_id);
            setStreamingContent('');

            // Сохраняем ветку локально
            const chatIdToSave = currentChatId || result.chat_id;
            if (chatIdToSave) {
                saveLeafMessageId(chatIdToSave, result.assistant_message_id);
            }
        } catch (error: any) {
            console.error('[ChatViewPage] Failed to send message', error);
            setCurrentBranch((prev) => prev.filter((m) => !m.id.startsWith('temp-')));

            if (error?.response?.status === 402) {
                showToast('Not enough credits. Top up your balance.', 'error');
            } else {
                showToast(error?.message || 'Failed to send message.', 'error');
            }
        } finally {
            setSending(false);
            setStreamingContent('');
        }
    }, [inputText, accessToken, sending, currentBranch, currentChatId, navigate, showToast, addChat]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSendMessage();
        }
    }, [handleSendMessage]);

    const stopVolumeMonitor = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = undefined;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
            analyserRef.current = null;
        }
        setNormalizedVolume(0);
    }, []);

    const startVolumeMonitor = useCallback((stream: MediaStream) => {
        try {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            const buffer = new Uint8Array(analyser.fftSize);

            const update = () => {
                analyser.getByteTimeDomainData(buffer);
                let sumSquares = 0;
                for (let i = 0; i < buffer.length; i += 1) {
                    const deviation = buffer[i] - 128;
                    sumSquares += deviation * deviation;
                }
                const rms = Math.sqrt(sumSquares / buffer.length) / 128;
                setNormalizedVolume(Number.isFinite(rms) ? rms : 0);
                animationFrameRef.current = requestAnimationFrame(update);
            };

            update();
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
        } catch (error) {
            console.error('[ChatViewPage] Failed to initialize volume monitor', error);
        }
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            const mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm'});

            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stopVolumeMonitor();
                stream.getTracks().forEach((t) => t.stop());

                if (audioChunksRef.current.length === 0) return;

                const blob = new Blob(audioChunksRef.current, {type: 'audio/webm'});
                setIsTranscribing(true);

                try {
                    const arrayBuffer = await blob.arrayBuffer();
                    const result = await winkyTranscribe(arrayBuffer, accessToken, {mimeType: 'audio/webm'});
                    if (result.text.trim()) {
                        setInputText((prev) => prev + (prev ? ' ' : '') + result.text.trim());
                        setTimeout(() => inputRef.current?.focus(), 0);
                    }
                } catch (error: any) {
                    console.error('[ChatViewPage] Transcription failed', error);
                    if (error?.response?.status === 402) {
                        showToast('Not enough credits. Top up your balance.', 'error');
                    } else {
                        showToast('Transcription failed.', 'error');
                    }
                } finally {
                    setIsTranscribing(false);
                }
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            startVolumeMonitor(stream);
            setIsRecording(true);
        } catch (error) {
            console.error('[ChatViewPage] Failed to start recording', error);
            showToast('Microphone access denied.', 'error');
        }
    }, [accessToken, showToast, startVolumeMonitor, stopVolumeMonitor]);

    const stopRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }
        setIsRecording(false);
    }, []);

    const handleMicClick = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            void startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    const handleBack = useCallback(() => {
        navigate('/chats');
    }, [navigate]);

    const handleRenameChat = useCallback(async (newTitle: string) => {
        if (!accessToken || !currentChatId) return;
        try {
            await updateWinkyChat(currentChatId, {title: newTitle}, accessToken);
            setChatTitle(newTitle);
            updateChatInContext(currentChatId, {title: newTitle});
            showToast('Chat renamed.', 'success');
        } catch (error) {
            console.error('[ChatViewPage] Failed to rename chat', error);
            showToast('Failed to rename chat.', 'error');
            throw error;
        }
    }, [accessToken, currentChatId, showToast, updateChatInContext]);

    const handleDeleteChat = useCallback(async () => {
        if (!currentChatId) return;
        try {
            await deleteChatFromContext(currentChatId);
            showToast('Chat deleted.', 'success');
            navigate('/chats');
        } catch (error) {
            console.error('[ChatViewPage] Failed to delete chat', error);
            showToast('Failed to delete chat.', 'error');
            throw error;
        }
    }, [currentChatId, navigate, showToast, deleteChatFromContext]);

    return (
        <div className="fc h-full w-full">
            <div
                className="frbc gap-2 px-3 py-1.5 border-b flex-shrink-0"
                style={{
                    borderColor: isDark ? darkSurface : 'var(--color-border-light)',
                    backgroundColor: isDark ? 'transparent' : '#ffffff'
                }}
            >
                <div className="frsc gap-2 min-w-0 flex-1">
                    <IconButton
                        onClick={handleBack}
                        size="small"
                        sx={{
                            padding: '3px',
                            backgroundColor: 'transparent',
                            boxShadow: 'none',
                            '&:hover': {
                                backgroundColor: 'transparent',
                                boxShadow: 'none'
                            }
                        }}
                    >
                        <ArrowBackRoundedIcon sx={{fontSize: 18}}/>
                    </IconButton>
                    <h1 className="text-base font-semibold text-text-primary truncate">
                        {isNewChat ? 'New Chat' : chatTitle || 'Chat'}
                    </h1>
                </div>
                {!isNewChat && currentChatId && (
                    <ChatActions
                        chatTitle={chatTitle || 'Chat'}
                        onRename={handleRenameChat}
                        onDelete={handleDeleteChat}
                        disabled={sending}
                        compact
                    />
                )}
            </div>

            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-4 py-4"
                style={{backgroundColor: isDark ? 'transparent' : '#ffffff'}}
            >
                <MessagesList
                    messages={currentBranch}
                    streamingContent={streamingContent}
                    loading={loading}
                    loadingMore={loadingMore}
                    editingMessageId={editingMessageId}
                    editText={editText}
                    siblingsData={siblingsData}
                    switchingBranchAtMessageId={switchingBranchAtMessageId}
                    onEditStart={handleEditStart}
                    onEditChange={handleEditChange}
                    onEditSubmit={handleEditSubmit}
                    onEditCancel={handleEditCancel}
                    onSiblingNavigate={handleSiblingNavigate}
                />
            </div>

            <div
                className="px-4 py-3 border-t flex-shrink-0"
                style={{
                    borderColor: isDark ? darkSurface : 'var(--color-border-light)',
                    backgroundColor: isDark ? 'transparent' : '#ffffff',
                    overflow: 'visible'
                }}
            >
                <div className="frsc gap-2">
                    <TextField
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isRecording ? 'Recording...' : isTranscribing ? 'Transcribing...' : 'Type a message...'}
                        disabled={isTranscribing}
                        fullWidth
                        multiline
                        maxRows={10}
                        minRows={1}
                        slotProps={{htmlInput: {ref: inputRef}}}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px',
                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)',
                                padding: '10px 14px 3px 14px',
                                minHeight: '42px',
                                transition: 'background-color 0.2s ease, backdrop-filter 0.2s ease',
                                boxShadow: 'none !important',
                                '& fieldset, & .MuiOutlinedInput-notchedOutline': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                                    boxShadow: 'none !important'
                                },
                                '&:hover fieldset, &:hover .MuiOutlinedInput-notchedOutline': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                                },
                                '&.Mui-focused': {
                                    backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)',
                                    backdropFilter: 'blur(12px)',
                                    boxShadow: 'none !important',
                                    outline: 'none'
                                },
                                '&.Mui-focused fieldset, &.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
                                    borderWidth: '1px',
                                    boxShadow: 'none !important'
                                },
                                '&.Mui-error fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'
                                }
                            },
                            '& .MuiInputBase-input': {
                                padding: 0,
                                lineHeight: 1.5,
                                '&::-webkit-scrollbar': {
                                    width: '2px'
                                },
                                '&::-webkit-scrollbar-track': {
                                    background: 'transparent'
                                },
                                '&::-webkit-scrollbar-thumb': {
                                    background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                                    borderRadius: '2px'
                                },
                                '&::-webkit-scrollbar-thumb:hover': {
                                    background: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'
                                }
                            }
                        }}
                    />

                    <div className="relative" style={{overflow: 'visible'}}>
                        <MicWaves isRecording={isRecording} normalizedVolume={normalizedVolume}/>
                        <IconButton
                            onClick={handleMicClick}
                            disabled={isTranscribing}
                            sx={{
                                position: 'relative',
                                zIndex: 1,
                                backgroundColor: isRecording
                                    ? '#e11d48'
                                    : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                '&:hover': {
                                    backgroundColor: isRecording
                                        ? '#be123c'
                                        : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
                                }
                            }}
                        >
                            {isRecording ? (
                                <StopRoundedIcon sx={{color: 'white'}}/>
                            ) : isTranscribing ? (
                                <CircularProgress size={24} color="inherit"/>
                            ) : (
                                <MicRoundedIcon/>
                            )}
                        </IconButton>
                    </div>

                    <IconButton
                        onClick={handleSendMessage}
                        disabled={!inputText.trim() || sending || isRecording || isTranscribing}
                        color="primary"
                        sx={{
                            backgroundColor: 'primary.main',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: 'primary.dark'
                            },
                            '&.Mui-disabled': {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'var(--color-bg-tertiary)',
                                color: 'text.disabled'
                            }
                        }}
                    >
                        {sending ? (
                            <CircularProgress size={24} color="inherit"/>
                        ) : (
                            <SendRoundedIcon sx={{transform: 'translateX(6%)'}}/>
                        )}
                    </IconButton>
                </div>
            </div>
        </div>
    );
};

export default ChatViewPage;
