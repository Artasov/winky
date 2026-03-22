import React, {useCallback, useEffect, useLayoutEffect, useRef, useState, memo, useMemo} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
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
import NoCreditsModal from '../components/NoCreditsModal';
import ChatActions from '../features/chats/components/ChatActions';
import ChatMessage, {ChatThinkingPlaceholder} from '../features/chats/components/ChatMessage';
import useSmoothedStreamingContent from '../features/chats/hooks/useSmoothedStreamingContent';
import {
    fetchWinkyChatBranch,
    fetchWinkyChat,
    fetchMessageChildren,
    fetchMessageBranch,
    winkyLLMStream,
    winkyTranscribe,
    updateWinkyChat
} from '../services/winkyAiApi';
import {llmBridge} from '../services/winkyBridge';
import {
    createLocalChatId,
    createLocalMessageId,
    getLocalChat,
    getLocalChatBranch,
    getLocalBranchFromMessage,
    getLocalMessageSiblings,
    getRemoteDraftChat,
    replaceLocalChatMessages,
    subscribeChatStorage,
    updateLocalChat,
    upsertLocalChat
} from '../features/chats/services/chatStorage';
import {
    consumeChatLaunchRequest,
    type ChatLaunchRequest
} from '../features/chats/services/chatLaunchRequests';
import {createChatMeta, getChatModelOptions} from '../features/chats/utils/chatProviders';
import {getChatModelPreference} from '../features/chats/services/chatModelPreferences';
import {buildChatPrompt} from '../features/chats/utils/chatPrompt';
import {
    clearChatTitleBarModelState,
    setChatTitleBarModelState
} from '../services/chatTitleBarState';

const CHAT_BRANCHES_STORAGE_KEY = 'winky_chat_branches';
const CHAT_DETACH_THRESHOLD_PX = 72;
const CHAT_ATTACH_THRESHOLD_PX = 160;

const getWinkyModelLevel = (model: string | null | undefined): 'low' | 'mid' | 'high' => {
    if (model === 'winky-low') return 'low';
    if (model === 'winky-mid') return 'mid';
    return 'high';
};

const mergeMessages = (...messages: WinkyChatMessage[]): WinkyChatMessage[] => {
    const map = new Map<string, WinkyChatMessage>();
    for (const message of messages) {
        map.set(message.id, message);
    }
    return [...map.values()].sort((left, right) => {
        if (left.parent_id === right.id) {
            return 1;
        }
        if (right.parent_id === left.id) {
            return -1;
        }
        const leftTime = new Date(left.created_at).getTime();
        const rightTime = new Date(right.created_at).getTime();
        if (leftTime !== rightTime) {
            return leftTime - rightTime;
        }
        if (left.role !== right.role) {
            return left.role === 'user' ? -1 : 1;
        }
        return left.id.localeCompare(right.id);
    });
};

const replacePendingUserMessage = (
    messages: WinkyChatMessage[],
    tempMessageId: string,
    nextMessage: WinkyChatMessage
): WinkyChatMessage[] => {
    const filtered = messages.filter((message) => message.id !== tempMessageId && message.id !== nextMessage.id);
    return mergeMessages(...filtered, nextMessage);
};

const buildResolvedUserMessage = (
    existingMessage: WinkyChatMessage | undefined,
    fallback: Omit<WinkyChatMessage, 'created_at'>
): WinkyChatMessage => ({
    ...existingMessage,
    ...fallback,
    created_at: existingMessage?.created_at || new Date().toISOString()
});

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
    showStreamingPlaceholder: boolean;
    streamingModelLevel: 'low' | 'mid' | 'high' | 'transcribe';
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
    showStreamingPlaceholder,
    streamingModelLevel,
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

    if (messages.length === 0 && !streamingContent && !showStreamingPlaceholder) {
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

            {showStreamingPlaceholder && !streamingContent && (
                <ChatThinkingPlaceholder/>
            )}

            {streamingContent && (
                <ChatMessage
                    message={{
                        id: 'streaming',
                        parent_id: null,
                        role: 'assistant',
                        content: streamingContent,
                        model_level: streamingModelLevel,
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
    const location = useLocation();
    const navigate = useNavigate();
    const {showToast} = useToast();
    const {config} = useConfig();
    const {chats, addChat, updateChat: updateChatInContext, deleteChat: deleteChatFromContext} = useChats();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.12);

    const [currentBranch, setCurrentBranch] = useState<WinkyChatMessage[]>([]);
    const [loading, setLoading] = useState(!isNewChat);
    const [sending, setSending] = useState(false);
    const [inputText, setInputText] = useState('');
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
    const [showNoCreditsModal, setShowNoCreditsModal] = useState(false);
    const [launchRequest, setLaunchRequest] = useState<ChatLaunchRequest | null>(null);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const scrollHeightBeforeLoad = useRef<number>(0);
    const skipNextScrollToBottom = useRef<boolean>(false);
    const autoScrollToBottomRef = useRef(true);
    const lastScrollTopRef = useRef(0);
    const scrollAnimationFrameRef = useRef<number | null>(null);
    const llmAbortControllerRef = useRef<AbortController | null>(null);
    const consumedLaunchIdRef = useRef<string | null>(null);
    const autoSentLaunchIdRef = useRef<string | null>(null);
    const pendingRequestRef = useRef<{
        mode: 'send' | 'edit';
        tempUserMessageId: string;
        text: string;
        parentMessageId: string | null;
        messagesBeforeEdit?: WinkyChatMessage[];
        startedChatId: string | null;
        startedUserMessageId: string | null;
    } | null>(null);

    const {
        streamingContent,
        appendStreamingChunk,
        flushStreamingContent,
        getStreamingContent,
        resetStreamingContent
    } = useSmoothedStreamingContent();

    const accessToken = config?.auth?.access || config?.auth?.accessToken || '';

    const launchRequestId = useMemo(() => {
        if (!isNewChat) {
            return null;
        }
        return new URLSearchParams(location.search).get('launch');
    }, [isNewChat, location.search]);

    const activeChat = useMemo(() => {
        const targetId = currentChatId || (isNewChat ? null : chatId || null);
        if (!targetId) {
            return null;
        }
        return chats.find((chat) => chat.id === targetId) || null;
    }, [chatId, chats, currentChatId, isNewChat]);

    const chatModelPreference = useMemo(() => {
        const targetId = currentChatId || (isNewChat ? null : chatId || null);
        if (!targetId) {
            return null;
        }
        return getChatModelPreference(targetId);
    }, [chatId, currentChatId, isNewChat, activeChat?.model_name, activeChat?.llm_mode]);

    const runtimeChatMeta = useMemo(() => {
        const preferredModelName = activeChat?.model_name || chatModelPreference?.model_name || null;
        const preferredLlmMode = activeChat?.llm_mode || chatModelPreference?.llm_mode || null;
        if (activeChat?.llm_mode && activeChat.model_name) {
            return {
                storage: activeChat.storage || 'remote',
                provider: activeChat.provider || 'winky',
                llmMode: activeChat.llm_mode,
                modelName: activeChat.model_name
            };
        }
        if (activeChat && preferredModelName && preferredLlmMode) {
            const chatMeta = createChatMeta(preferredLlmMode, preferredModelName);
            return {
                storage: activeChat.storage || chatMeta.storage,
                provider: activeChat.provider || chatMeta.provider,
                llmMode: preferredLlmMode,
                modelName: preferredModelName
            };
        }
        if (activeChat?.storage === 'remote') {
            const fallbackRemoteModel = String(config?.llm?.model || '').startsWith('winky-')
                ? String(config?.llm?.model)
                : 'winky-high';
            return {
                storage: 'remote' as const,
                provider: 'winky' as const,
                llmMode: 'api' as const,
                modelName: fallbackRemoteModel
            };
        }
        if (launchRequest) {
            const chatMeta = createChatMeta(launchRequest.mode, launchRequest.model);
            return {
                storage: chatMeta.storage,
                provider: chatMeta.provider,
                llmMode: launchRequest.mode,
                modelName: launchRequest.model
            };
        }
        const nextMode = config?.llm?.mode || 'api';
        const nextModel = config?.llm?.model || 'winky-high';
        const chatMeta = createChatMeta(nextMode, nextModel);
        return {
            storage: activeChat?.storage || chatMeta.storage,
            provider: activeChat?.provider || chatMeta.provider,
            llmMode: nextMode,
            modelName: nextModel
        };
    }, [activeChat, chatModelPreference, config?.llm?.mode, config?.llm?.model, launchRequest]);

    const modelLevel = useMemo(
        (): 'low' | 'mid' | 'high' => getWinkyModelLevel(runtimeChatMeta.modelName),
        [runtimeChatMeta.modelName]
    );

    const chatAdditionalContext = activeChat?.additional_context || launchRequest?.additionalContext || '';
    const preferredChatTitle = activeChat?.title || launchRequest?.preferredTitle || '';
    const chatModelOptions = useMemo(() => getChatModelOptions(runtimeChatMeta.provider), [runtimeChatMeta.provider]);

    const getLastPersistedMessage = useCallback((messages: WinkyChatMessage[]): WinkyChatMessage | null => {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            if (!messages[index].id.startsWith('temp-')) return messages[index];
        }
        return null;
    }, []);

    const isNearBottom = useCallback((container: HTMLDivElement | null): boolean => {
        if (!container) {
            return true;
        }
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distanceToBottom <= CHAT_ATTACH_THRESHOLD_PX;
    }, []);

    const scrollToBottom = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        autoScrollToBottomRef.current = true;
        if (scrollAnimationFrameRef.current !== null) {
            cancelAnimationFrame(scrollAnimationFrameRef.current);
            scrollAnimationFrameRef.current = null;
        }

        const animateScroll = () => {
            const targetContainer = messagesContainerRef.current;
            if (!targetContainer) {
                scrollAnimationFrameRef.current = null;
                return;
            }

            const targetScrollTop = Math.max(0, targetContainer.scrollHeight - targetContainer.clientHeight);
            const distance = targetScrollTop - targetContainer.scrollTop;

            if (distance <= 1) {
                targetContainer.scrollTop = targetScrollTop;
                lastScrollTopRef.current = targetContainer.scrollTop;
                scrollAnimationFrameRef.current = null;
                return;
            }

            targetContainer.scrollTop += Math.max(1, distance * 0.22);
            lastScrollTopRef.current = targetContainer.scrollTop;
            scrollAnimationFrameRef.current = requestAnimationFrame(animateScroll);
        };

        scrollAnimationFrameRef.current = requestAnimationFrame(animateScroll);
    }, []);

    const handleStopResponse = useCallback(() => {
        llmAbortControllerRef.current?.abort();
    }, []);

    const handleAbortedRequest = useCallback(() => {
        const pendingRequest = pendingRequestRef.current;
        if (!pendingRequest) return;
        const partialAssistantContent = getStreamingContent();
        const hasPartialAssistant = partialAssistantContent.trim().length > 0;

        const userMessageId = pendingRequest.startedUserMessageId || pendingRequest.tempUserMessageId;
        const userMessage: WinkyChatMessage = {
            id: userMessageId,
            parent_id: pendingRequest.parentMessageId,
            role: 'user',
            content: pendingRequest.text,
            model_level: modelLevel,
            tokens: 0,
            has_children: false,
            sibling_count: 0,
            sibling_index: 0,
            created_at: new Date().toISOString()
        };

        const assistantMessage: WinkyChatMessage | null = hasPartialAssistant ? {
            id: `temp-assistant-aborted-${Date.now()}`,
            parent_id: userMessageId,
            role: 'assistant',
            content: partialAssistantContent,
            model_level: modelLevel,
            tokens: 0,
            has_children: false,
            sibling_count: 0,
            sibling_index: 0,
            created_at: new Date().toISOString()
        } : null;

        if (pendingRequest.mode === 'edit') {
            setCurrentBranch([
                ...(pendingRequest.messagesBeforeEdit || []),
                userMessage,
                ...(assistantMessage ? [assistantMessage] : [])
            ]);
        } else {
            setCurrentBranch((prev) => {
                const filtered = prev.filter((message) => message.id !== pendingRequest.tempUserMessageId);
                return [...filtered, userMessage, ...(assistantMessage ? [assistantMessage] : [])];
            });
        }

        if (pendingRequest.startedUserMessageId) {
            setLeafMessageId(pendingRequest.startedUserMessageId);
            if (!currentChatId && pendingRequest.startedChatId) {
                setCurrentChatId(pendingRequest.startedChatId);
                navigate(`/chats/${pendingRequest.startedChatId}`, {replace: true});
                addChat({
                    id: pendingRequest.startedChatId,
                    title: '',
                    additional_context: '',
                    message_count: assistantMessage ? 2 : 1,
                    last_leaf_message_id: pendingRequest.startedUserMessageId,
                    pinned_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }
            if (currentChatId || pendingRequest.startedChatId) {
                saveLeafMessageId(currentChatId || pendingRequest.startedChatId!, pendingRequest.startedUserMessageId);
            }
        }
    }, [currentChatId, modelLevel, navigate, addChat, getStreamingContent]);

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
        if (!chatId || isNewChat) {
            setCurrentChatId(null);
            setCurrentBranch([]);
            setLeafMessageId(null);
            setHasMoreMessages(false);
            setNextCursor(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const localChat = getLocalChat(chatId);
            if (localChat) {
                const localBranch = getLocalChatBranch(chatId, localChat.chat.last_leaf_message_id);
                const nextLeafMessageId = localBranch[localBranch.length - 1]?.id || localChat.chat.last_leaf_message_id;
                setChatTitle(localChat.chat.title || '');
                setCurrentChatId(chatId);
                setCurrentBranch(localBranch);
                setLeafMessageId(nextLeafMessageId);
                setSiblingsData(new Map());
                setHasMoreMessages(false);
                setNextCursor(null);
                return;
            }

            const remoteDraftChat = getRemoteDraftChat(chatId);
            if (remoteDraftChat) {
                setChatTitle(remoteDraftChat.chat.title || '');
                setCurrentChatId(chatId);
                setCurrentBranch(remoteDraftChat.messages);
                setLeafMessageId(remoteDraftChat.chat.last_leaf_message_id);
                setHasMoreMessages(false);
                setNextCursor(null);
                return;
            }

            if (!accessToken) {
                setCurrentBranch([]);
                return;
            }

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
        if (!isNewChat) {
            setLaunchRequest(null);
            consumedLaunchIdRef.current = null;
            autoSentLaunchIdRef.current = null;
            return;
        }
        if (!launchRequestId || consumedLaunchIdRef.current === launchRequestId) {
            return;
        }
        consumedLaunchIdRef.current = launchRequestId;
        const nextLaunchRequest = consumeChatLaunchRequest(launchRequestId);
        setLaunchRequest(nextLaunchRequest);
        if (nextLaunchRequest?.preferredTitle) {
            setChatTitle(nextLaunchRequest.preferredTitle);
        }
    }, [isNewChat, launchRequestId]);

    useEffect(() => {
        if (isNewChat) {
            return;
        }
        const targetId = currentChatId || chatId || null;
        if (!targetId) {
            return;
        }

        const syncStoredChat = () => {
            const localChat = getLocalChat(targetId);
            if (localChat) {
                const localBranch = getLocalChatBranch(targetId, localChat.chat.last_leaf_message_id);
                const nextLeafMessageId = localBranch[localBranch.length - 1]?.id || localChat.chat.last_leaf_message_id;
                setChatTitle(localChat.chat.title || '');
                setCurrentChatId(localChat.chat.id);
                setCurrentBranch(localBranch);
                setLeafMessageId(nextLeafMessageId);
                setSiblingsData(new Map());
                setHasMoreMessages(false);
                setNextCursor(null);
                setLoading(false);
                return;
            }

            const remoteDraftChat = getRemoteDraftChat(targetId);
            if (!remoteDraftChat) {
                return;
            }
            setChatTitle(remoteDraftChat.chat.title || '');
            setCurrentChatId(remoteDraftChat.chat.id);
            setCurrentBranch(remoteDraftChat.messages);
            setLeafMessageId(remoteDraftChat.chat.last_leaf_message_id);
            setHasMoreMessages(false);
            setNextCursor(null);
            setLoading(false);
        };

        syncStoredChat();
        return subscribeChatStorage(syncStoredChat);
    }, [chatId, currentChatId, isNewChat]);

    useLayoutEffect(() => {
        // Не скроллим при загрузке старых сообщений или при переключении веток
        if (skipNextScrollToBottom.current) {
            skipNextScrollToBottom.current = false;
            return;
        }
        if (!loadingMore && !switchingBranchAtMessageId && autoScrollToBottomRef.current) {
            scrollToBottom();
        }
    }, [currentBranch, streamingContent, scrollToBottom, loadingMore, switchingBranchAtMessageId]);

    useEffect(() => {
        return () => {
            if (scrollAnimationFrameRef.current !== null) {
                cancelAnimationFrame(scrollAnimationFrameRef.current);
            }
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
        if (!container) return;

        const currentScrollTop = container.scrollTop;
        const scrollDelta = currentScrollTop - lastScrollTopRef.current;
        const distanceToBottom = container.scrollHeight - currentScrollTop - container.clientHeight;

        if (autoScrollToBottomRef.current) {
            if (scrollDelta < -2 && distanceToBottom > CHAT_DETACH_THRESHOLD_PX) {
                autoScrollToBottomRef.current = false;
                if (scrollAnimationFrameRef.current !== null) {
                    cancelAnimationFrame(scrollAnimationFrameRef.current);
                    scrollAnimationFrameRef.current = null;
                }
            }
        } else if (scrollDelta > 0 && distanceToBottom <= CHAT_ATTACH_THRESHOLD_PX) {
            scrollToBottom();
        } else if (isNearBottom(container)) {
            autoScrollToBottomRef.current = true;
        }

        lastScrollTopRef.current = currentScrollTop;

        if (runtimeChatMeta.storage === 'local' || loadingMore || !hasMoreMessages || !nextCursor) return;

        if (container.scrollTop < 100) {
            void loadBranch(leafMessageId || undefined, nextCursor);
        }
    }, [hasMoreMessages, isNearBottom, leafMessageId, loadBranch, loadingMore, nextCursor, runtimeChatMeta.storage, scrollToBottom]);

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

    const handleEditSubmit = useCallback(async () => {
        const text = editText.trim();
        if (!text || sending || !editingMessageId) return;

        const editingMessage = currentBranch.find(m => m.id === editingMessageId);
        if (!editingMessage) return;

        const parentMessageId = editingMessage.parent_id;

        setSending(true);
        setEditingMessageId(null);
        setEditText('');
        resetStreamingContent();

        if (runtimeChatMeta.storage === 'local') {
            const localChatId = currentChatId;
            if (!localChatId) {
                setSending(false);
                return;
            }

            const localRecord = getLocalChat(localChatId);
            if (!localRecord) {
                setSending(false);
                showToast('Failed to load local chat.', 'error');
                return;
            }

            const startedAt = new Date().toISOString();
            const userMessageId = createLocalMessageId();
            const assistantMessageId = createLocalMessageId();
            const tempUserMessage: WinkyChatMessage = {
                id: userMessageId,
                parent_id: parentMessageId,
                role: 'user',
                content: text,
                model_level: runtimeChatMeta.modelName,
                provider: runtimeChatMeta.provider,
                model_name: runtimeChatMeta.modelName,
                tokens: 0,
                has_children: false,
                sibling_count: 0,
                sibling_index: 0,
                created_at: startedAt
            };

            const editingIndex = currentBranch.findIndex((message) => message.id === editingMessageId);
            const messagesBeforeEdit = editingIndex > 0 ? currentBranch.slice(0, editingIndex) : [];
            const previewBranch = mergeMessages(...messagesBeforeEdit, tempUserMessage);

            llmAbortControllerRef.current = new AbortController();
            setCurrentBranch(previewBranch);
            updateLocalChat(localChatId, {
                updated_at: startedAt,
                last_leaf_message_id: userMessageId,
                message_count: (getLocalChat(localChatId)?.messages.length ?? localRecord.messages.length) + 1
            });
            replaceLocalChatMessages(localChatId, [tempUserMessage]);
            setLeafMessageId(userMessageId);
            scrollToBottom();
            requestAnimationFrame(scrollToBottom);

            try {
                const response = await llmBridge.process(
                    text,
                    buildChatPrompt(chatAdditionalContext, messagesBeforeEdit),
                    {
                        mode: runtimeChatMeta.llmMode,
                        model: runtimeChatMeta.modelName,
                        openaiKey: config?.apiKeys.openai,
                        googleKey: config?.apiKeys.google,
                        accessToken
                    },
                    {
                        signal: llmAbortControllerRef.current.signal,
                        onChunk: (chunk) => {
                            appendStreamingChunk(chunk);
                            updateLocalChat(localChatId, {
                                updated_at: new Date().toISOString(),
                                last_leaf_message_id: userMessageId,
                                message_count: (getLocalChat(localChatId)?.messages.length ?? localRecord.messages.length) + 1
                            });
                        }
                    }
                );

                flushStreamingContent();

                const finalResponse = response.trim().length ? response : getStreamingContent().trim();
                const assistantMessage: WinkyChatMessage = {
                    id: assistantMessageId,
                    parent_id: userMessageId,
                    role: 'assistant',
                    content: finalResponse,
                    model_level: runtimeChatMeta.modelName,
                    provider: runtimeChatMeta.provider,
                    model_name: runtimeChatMeta.modelName,
                    tokens: 0,
                    has_children: false,
                    sibling_count: 0,
                    sibling_index: 0,
                    created_at: startedAt
                };

                replaceLocalChatMessages(localChatId, [{...tempUserMessage, has_children: true}, assistantMessage]);
                updateLocalChat(localChatId, {
                    updated_at: new Date().toISOString(),
                    last_leaf_message_id: assistantMessageId,
                    message_count: (getLocalChat(localChatId)?.messages.length ?? 0)
                });
                const nextBranch = getLocalChatBranch(localChatId, assistantMessageId);
                setCurrentBranch(nextBranch);
                setLeafMessageId(assistantMessageId);

                const localSiblings = getLocalMessageSiblings(localChatId, userMessageId);
                if (localSiblings && localSiblings.total > 1) {
                    setSiblingsData((prev) => {
                        const nextMap = new Map(prev);
                        localSiblings.items.forEach((item, index) => {
                            nextMap.set(item.id, {
                                items: localSiblings.items,
                                total: localSiblings.total,
                                currentIndex: index
                            });
                        });
                        return nextMap;
                    });
                }
                return;
            } catch (error: any) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    const partialContent = getStreamingContent().trim();
                    if (partialContent) {
                        const assistantMessage: WinkyChatMessage = {
                            id: assistantMessageId,
                            parent_id: userMessageId,
                            role: 'assistant',
                            content: partialContent,
                            model_level: runtimeChatMeta.modelName,
                            provider: runtimeChatMeta.provider,
                            model_name: runtimeChatMeta.modelName,
                            tokens: 0,
                            has_children: false,
                            sibling_count: 0,
                            sibling_index: 0,
                            created_at: startedAt
                        };
                        replaceLocalChatMessages(localChatId, [{...tempUserMessage, has_children: true}, assistantMessage]);
                        updateLocalChat(localChatId, {
                            updated_at: new Date().toISOString(),
                            last_leaf_message_id: assistantMessageId,
                            message_count: (getLocalChat(localChatId)?.messages.length ?? localRecord.messages.length) + 2
                        });
                        const nextBranch = getLocalChatBranch(localChatId, assistantMessageId);
                        setCurrentBranch(nextBranch);
                        setLeafMessageId(assistantMessageId);
                    } else {
                        const nextBranch = getLocalChatBranch(localChatId, userMessageId);
                        setCurrentBranch(nextBranch);
                        setLeafMessageId(userMessageId);
                    }
                    return;
                }

                console.error('[ChatViewPage] Failed to send edited local message', error);
                showToast(error?.message || 'Failed to send message.', 'error');
                setCurrentBranch(currentBranch);
                return;
            } finally {
                llmAbortControllerRef.current = null;
                setSending(false);
                resetStreamingContent();
            }
        }

        if (!accessToken) {
            setSending(false);
            showToast('Authentication is required.', 'error');
            return;
        }

        const tempUserMessage: WinkyChatMessage = {
            id: `temp-user-${Date.now()}`,
            parent_id: parentMessageId,
            role: 'user',
            content: text,
            model_level: modelLevel,
            tokens: 0,
            has_children: false,
            sibling_count: 0,
            sibling_index: 0,
            created_at: new Date().toISOString()
        };

        const editingIndex = currentBranch.findIndex(m => m.id === editingMessageId);
        const messagesBeforeEdit = editingIndex > 0 ? currentBranch.slice(0, editingIndex) : [];
        setCurrentBranch([...messagesBeforeEdit, tempUserMessage]);
        pendingRequestRef.current = {
            mode: 'edit',
            tempUserMessageId: tempUserMessage.id,
            text,
            parentMessageId,
            messagesBeforeEdit,
            startedChatId: currentChatId,
            startedUserMessageId: null
        };
        llmAbortControllerRef.current = new AbortController();
        scrollToBottom();
        requestAnimationFrame(scrollToBottom);

        try {
            const result = await winkyLLMStream(
                {
                    prompt: text,
                    model_level: modelLevel,
                    chat_id: currentChatId || undefined,
                    parent_message_id: parentMessageId,
                    preferred_title: preferredChatTitle || undefined,
                    additional_context: chatAdditionalContext || undefined
                },
                accessToken,
                appendStreamingChunk,
                llmAbortControllerRef.current.signal,
                {
                    onStart: ({chat_id, user_message_id}) => {
                        if (pendingRequestRef.current?.tempUserMessageId === tempUserMessage.id) {
                            pendingRequestRef.current.startedChatId = chat_id;
                            pendingRequestRef.current.startedUserMessageId = user_message_id;
                            setCurrentBranch((prev) => replacePendingUserMessage(prev, tempUserMessage.id, {
                                ...tempUserMessage,
                                id: user_message_id,
                                has_children: true
                            }));
                            if (!currentChatId) {
                                setCurrentChatId(chat_id);
                                navigate(`/chats/${chat_id}`, {replace: true});
                                addChat({
                                    id: chat_id,
                                    title: preferredChatTitle,
                                    additional_context: chatAdditionalContext,
                                    provider: runtimeChatMeta.provider,
                                    model_name: runtimeChatMeta.modelName,
                                    llm_mode: runtimeChatMeta.llmMode,
                                    message_count: 1,
                                    last_leaf_message_id: user_message_id,
                                    pinned_at: null,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                });
                            }
                        }
                    }
                }
            );

            flushStreamingContent();

            if (!currentChatId && result.chat_id) {
                setCurrentChatId(result.chat_id);
                navigate(`/chats/${result.chat_id}`, {replace: true});
                addChat({
                    id: result.chat_id,
                    title: preferredChatTitle,
                    additional_context: chatAdditionalContext,
                    provider: runtimeChatMeta.provider,
                    model_name: runtimeChatMeta.modelName,
                    llm_mode: runtimeChatMeta.llmMode,
                    message_count: 2,
                    last_leaf_message_id: result.assistant_message_id,
                    pinned_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }

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
                const userMessage = buildResolvedUserMessage(prev.find((message) => message.id === result.user_message_id), {
                    id: result.user_message_id,
                    parent_id: parentMessageId,
                    role: 'user',
                    content: text,
                    model_level: modelLevel,
                    tokens: 0,
                    has_children: true,
                    sibling_count: 1,
                    sibling_index: 1
                });
                return mergeMessages(...messagesBeforeEdit, userMessage, assistantMessage);
            });
            setLeafMessageId(result.assistant_message_id);
            resetStreamingContent();

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
            if (error instanceof DOMException && error.name === 'AbortError') {
                handleAbortedRequest();
                return;
            }
            console.error('[ChatViewPage] Failed to send edited message', error);
            setCurrentBranch(currentBranch);

            if (error?.response?.status === 402) {
                setShowNoCreditsModal(true);
            } else {
                showToast(error?.message || 'Failed to send message.', 'error');
            }
        } finally {
            llmAbortControllerRef.current = null;
            pendingRequestRef.current = null;
            setSending(false);
            resetStreamingContent();
        }
    }, [runtimeChatMeta, editText, accessToken, sending, editingMessageId, currentBranch, currentChatId, navigate, showToast, addChat, appendStreamingChunk, flushStreamingContent, getStreamingContent, resetStreamingContent, loadSiblings, scrollToBottom, handleAbortedRequest, config?.apiKeys.google, config?.apiKeys.openai, preferredChatTitle, chatAdditionalContext, modelLevel]);

    const handleSiblingNavigate = useCallback(async (message: WinkyChatMessage, direction: 'prev' | 'next') => {
        if (runtimeChatMeta.storage === 'local') {
            if (!currentChatId) return;

            const siblingInfo = getLocalMessageSiblings(currentChatId, message.id);
            if (!siblingInfo || siblingInfo.total <= 1) return;

            const newIndex = direction === 'prev'
                ? siblingInfo.currentIndex - 1
                : siblingInfo.currentIndex + 1;

            if (newIndex < 0 || newIndex >= siblingInfo.items.length) return;

            const nextMessage = siblingInfo.items[newIndex];
            const messageIndex = currentBranch.findIndex((item) => item.id === message.id);
            if (messageIndex < 0) return;

            const originalBranch = [...currentBranch];
            const container = messagesContainerRef.current;
            const scrollTopBefore = container?.scrollTop || 0;

            setCurrentBranch(currentBranch.slice(0, messageIndex + 1));
            setSwitchingBranchAtMessageId(message.id);

            try {
                const nextBranch = getLocalBranchFromMessage(currentChatId, nextMessage.id);
                setCurrentBranch(nextBranch);
                requestAnimationFrame(() => {
                    if (container) {
                        container.scrollTop = scrollTopBefore;
                    }
                    skipNextScrollToBottom.current = true;
                    setSwitchingBranchAtMessageId(null);
                });

                const nextLeafMessageId = nextBranch[nextBranch.length - 1]?.id || nextMessage.id;
                setLeafMessageId(nextLeafMessageId);
                updateLocalChat(currentChatId, {
                    last_leaf_message_id: nextLeafMessageId,
                    updated_at: new Date().toISOString()
                });

                setSiblingsData((prev) => {
                    const nextMap = new Map(prev);
                    siblingInfo.items.forEach((item, index) => {
                        nextMap.set(item.id, {
                            items: siblingInfo.items,
                            total: siblingInfo.total,
                            currentIndex: index
                        });
                    });
                    return nextMap;
                });
                return;
            } catch (error) {
                console.error('[ChatViewPage] Failed to switch local branch', error);
                showToast('Failed to switch branch.', 'error');
                setCurrentBranch(originalBranch);
                setSwitchingBranchAtMessageId(null);
                return;
            }
        }

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
    }, [runtimeChatMeta.storage, siblingsData, loadSiblings, currentBranch, currentChatId, accessToken, showToast]);

    const handleSendMessage = useCallback(async (inputOverride?: string | React.SyntheticEvent) => {
        const overrideText = typeof inputOverride === 'string' ? inputOverride : inputText;
        const text = overrideText.trim();
        if (!text || sending) return;

        setSending(true);
        setInputText('');
        resetStreamingContent();

        const lastMessage = getLastPersistedMessage(currentBranch);
        const parentMessageId = lastMessage?.id || null;

        if (runtimeChatMeta.storage === 'local') {
            const startedAt = new Date().toISOString();
            const localChatId = currentChatId || createLocalChatId();
            const userMessageId = createLocalMessageId();
            const assistantMessageId = createLocalMessageId();
            const userMessage: WinkyChatMessage = {
                id: userMessageId,
                parent_id: parentMessageId,
                role: 'user',
                content: text,
                model_level: runtimeChatMeta.modelName,
                provider: runtimeChatMeta.provider,
                model_name: runtimeChatMeta.modelName,
                tokens: 0,
                has_children: false,
                sibling_count: 0,
                sibling_index: 0,
                created_at: startedAt
            };
            const baseMessages = mergeMessages(...currentBranch.filter((message) => !message.id.startsWith('temp-')), userMessage);
            const localChatTitle = preferredChatTitle || text.slice(0, 50) + (text.length > 50 ? '...' : '');

            llmAbortControllerRef.current = new AbortController();
            upsertLocalChat(
                {
                    id: localChatId,
                    title: localChatTitle,
                    additional_context: chatAdditionalContext,
                    message_count: (getLocalChat(localChatId)?.messages.length ?? 0) + 1,
                    last_leaf_message_id: userMessageId,
                    pinned_at: activeChat?.pinned_at || null,
                    created_at: activeChat?.created_at || startedAt,
                    updated_at: startedAt,
                    storage: 'local',
                    provider: runtimeChatMeta.provider,
                    model_name: runtimeChatMeta.modelName,
                    llm_mode: runtimeChatMeta.llmMode
                },
                [userMessage]
            );
            updateLocalChat(localChatId, {
                message_count: getLocalChat(localChatId)?.messages.length ?? 1
            });
            const nextUserBranch = getLocalChatBranch(localChatId, userMessageId);
            setCurrentBranch(nextUserBranch);
            setLeafMessageId(userMessageId);

            if (!currentChatId) {
                setCurrentChatId(localChatId);
                navigate(`/chats/${localChatId}`, {replace: true});
            }

            scrollToBottom();
            requestAnimationFrame(scrollToBottom);

            try {
                const response = await llmBridge.process(
                    text,
                    buildChatPrompt(chatAdditionalContext, currentBranch),
                    {
                        mode: runtimeChatMeta.llmMode,
                        model: runtimeChatMeta.modelName,
                        openaiKey: config?.apiKeys.openai,
                        googleKey: config?.apiKeys.google,
                        accessToken
                    },
                    {
                        signal: llmAbortControllerRef.current.signal,
                        onChunk: (chunk) => {
                            appendStreamingChunk(chunk);
                            updateLocalChat(localChatId, {
                                updated_at: new Date().toISOString(),
                                last_leaf_message_id: userMessageId,
                                message_count: getLocalChat(localChatId)?.messages.length ?? baseMessages.length
                            });
                        }
                    }
                );

                flushStreamingContent();

                const finalResponse = response.trim().length ? response : getStreamingContent();
                const assistantMessage: WinkyChatMessage = {
                    id: assistantMessageId,
                    parent_id: userMessageId,
                    role: 'assistant',
                    content: finalResponse,
                    model_level: runtimeChatMeta.modelName,
                    provider: runtimeChatMeta.provider,
                    model_name: runtimeChatMeta.modelName,
                    tokens: 0,
                    has_children: false,
                    sibling_count: 0,
                    sibling_index: 0,
                    created_at: startedAt
                };
                replaceLocalChatMessages(localChatId, [{...userMessage, has_children: true}, assistantMessage]);
                updateLocalChat(localChatId, {
                    title: localChatTitle,
                    updated_at: new Date().toISOString(),
                    last_leaf_message_id: assistantMessageId,
                    message_count: (getLocalChat(localChatId)?.messages.length ?? 0)
                });
                const nextBranch = getLocalChatBranch(localChatId, assistantMessageId);
                setCurrentBranch(nextBranch);
                setLeafMessageId(assistantMessageId);
                resetStreamingContent();
                return;
            } catch (error: any) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    const partialContent = getStreamingContent().trim();
                    if (partialContent) {
                        const assistantMessage: WinkyChatMessage = {
                            id: assistantMessageId,
                            parent_id: userMessageId,
                            role: 'assistant',
                            content: partialContent,
                            model_level: runtimeChatMeta.modelName,
                            provider: runtimeChatMeta.provider,
                            model_name: runtimeChatMeta.modelName,
                            tokens: 0,
                            has_children: false,
                            sibling_count: 0,
                            sibling_index: 0,
                            created_at: startedAt
                        };
                        replaceLocalChatMessages(localChatId, [{...userMessage, has_children: true}, assistantMessage]);
                        updateLocalChat(localChatId, {
                            updated_at: new Date().toISOString(),
                            last_leaf_message_id: assistantMessageId,
                            message_count: (getLocalChat(localChatId)?.messages.length ?? 0)
                        });
                        const nextBranch = getLocalChatBranch(localChatId, assistantMessageId);
                        setCurrentBranch(nextBranch);
                        setLeafMessageId(assistantMessageId);
                    } else {
                        const nextBranch = getLocalChatBranch(localChatId, userMessageId);
                        setCurrentBranch(nextBranch);
                        setLeafMessageId(userMessageId);
                    }
                    return;
                }
                console.error('[ChatViewPage] Failed to send local chat message', error);
                showToast(error?.message || 'Failed to send message.', 'error');
                setCurrentBranch(baseMessages);
                return;
            } finally {
                llmAbortControllerRef.current = null;
                setSending(false);
                resetStreamingContent();
            }
        }

        if (!accessToken) {
            setInputText(text);
            setSending(false);
            showToast('Authentication is required.', 'error');
            return;
        }

        const tempUserMessage: WinkyChatMessage = {
            id: `temp-user-${Date.now()}`,
            parent_id: parentMessageId,
            role: 'user',
            content: text,
            model_level: modelLevel,
            tokens: 0,
            has_children: false,
            sibling_count: 0,
            sibling_index: 0,
            created_at: new Date().toISOString()
        };

        setCurrentBranch((prev) => [...prev, tempUserMessage]);
        pendingRequestRef.current = {
            mode: 'send',
            tempUserMessageId: tempUserMessage.id,
            text,
            parentMessageId,
            startedChatId: currentChatId,
            startedUserMessageId: null
        };
        llmAbortControllerRef.current = new AbortController();
        scrollToBottom();
        requestAnimationFrame(scrollToBottom);

        try {
            const result = await winkyLLMStream(
                {
                    prompt: text,
                    model_level: modelLevel,
                    chat_id: currentChatId || undefined,
                    parent_message_id: parentMessageId
                },
                accessToken,
                appendStreamingChunk,
                llmAbortControllerRef.current.signal,
                {
                    onStart: ({chat_id, user_message_id}) => {
                        if (pendingRequestRef.current?.tempUserMessageId === tempUserMessage.id) {
                            pendingRequestRef.current.startedChatId = chat_id;
                            pendingRequestRef.current.startedUserMessageId = user_message_id;
                            setCurrentBranch((prev) => replacePendingUserMessage(prev, tempUserMessage.id, {
                                ...tempUserMessage,
                                id: user_message_id,
                                has_children: true
                            }));
                        }
                    }
                }
            );

            flushStreamingContent();

            if (!currentChatId && result.chat_id) {
                setCurrentChatId(result.chat_id);
                navigate(`/chats/${result.chat_id}`, {replace: true});
                addChat({
                    id: result.chat_id,
                    title: preferredChatTitle,
                    additional_context: chatAdditionalContext,
                    message_count: 2,
                    last_leaf_message_id: result.assistant_message_id,
                    pinned_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }

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
                const userMessage = buildResolvedUserMessage(prev.find((message) => message.id === result.user_message_id), {
                    id: result.user_message_id,
                    parent_id: parentMessageId,
                    role: 'user',
                    content: text,
                    model_level: modelLevel,
                    tokens: 0,
                    has_children: true,
                    sibling_count: 0,
                    sibling_index: 0
                });
                const filtered = prev.filter(
                    (message) => !message.id.startsWith('temp-') &&
                        message.id !== userMessage.id &&
                        message.id !== assistantMessage.id
                );
                return mergeMessages(...filtered, userMessage, assistantMessage);
            });

            setLeafMessageId(result.assistant_message_id);
            resetStreamingContent();

            // Сохраняем ветку локально
            const chatIdToSave = currentChatId || result.chat_id;
            if (chatIdToSave) {
                saveLeafMessageId(chatIdToSave, result.assistant_message_id);
            }
        } catch (error: any) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                handleAbortedRequest();
                return;
            }
            console.error('[ChatViewPage] Failed to send message', error);
            setCurrentBranch((prev) => prev.filter((m) => !m.id.startsWith('temp-')));

            if (error?.response?.status === 402) {
                setShowNoCreditsModal(true);
            } else {
                showToast(error?.message || 'Failed to send message.', 'error');
            }
        } finally {
            llmAbortControllerRef.current = null;
            pendingRequestRef.current = null;
            setSending(false);
            resetStreamingContent();
        }
    }, [inputText, accessToken, sending, currentBranch, currentChatId, navigate, showToast, addChat, activeChat, runtimeChatMeta, appendStreamingChunk, flushStreamingContent, getStreamingContent, getLastPersistedMessage, resetStreamingContent, scrollToBottom, handleAbortedRequest, config?.apiKeys.google, config?.apiKeys.openai, preferredChatTitle, chatAdditionalContext]);

    useEffect(() => {
        if (!isNewChat || !launchRequest || loading || sending) {
            return;
        }
        if (autoSentLaunchIdRef.current === launchRequest.id) {
            return;
        }
        autoSentLaunchIdRef.current = launchRequest.id;
        setInputText(launchRequest.text);
        scrollToBottom();
        requestAnimationFrame(() => {
            void handleSendMessage(launchRequest.text);
        });
    }, [isNewChat, launchRequest, loading, sending, handleSendMessage, scrollToBottom]);

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
                        setShowNoCreditsModal(true);
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
        if (!currentChatId) return;
        if (runtimeChatMeta.storage === 'local') {
            setChatTitle(newTitle);
            updateChatInContext(currentChatId, {title: newTitle, updated_at: new Date().toISOString()});
            showToast('Chat renamed.', 'success');
            return;
        }
        if (!accessToken) return;
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
    }, [accessToken, currentChatId, runtimeChatMeta.storage, showToast, updateChatInContext]);

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

    const handleModelChange = useCallback((nextModel: string) => {
        if (!currentChatId) {
            return;
        }
        const nextMode = runtimeChatMeta.provider === 'local' ? 'local' : 'api';
        const nextMeta = createChatMeta(nextMode, nextModel);
        const updatedAt = new Date().toISOString();
        if (runtimeChatMeta.storage === 'local') {
            updateLocalChat(currentChatId, {
                model_name: nextModel,
                llm_mode: nextMeta.llm_mode,
                provider: nextMeta.provider,
                updated_at: updatedAt
            });
        }
        updateChatInContext(currentChatId, {
            model_name: nextModel,
            llm_mode: nextMeta.llm_mode,
            provider: runtimeChatMeta.storage === 'remote' ? 'winky' : nextMeta.provider,
            updated_at: updatedAt
        });
    }, [currentChatId, runtimeChatMeta.provider, runtimeChatMeta.storage, updateChatInContext]);

    useEffect(() => {
        const sourceId = `chat-view:${chatId || 'new'}`;
        setChatTitleBarModelState({
            sourceId,
            value: runtimeChatMeta.modelName,
            options: chatModelOptions,
            disabled: sending || !currentChatId,
            onChange: handleModelChange
        });
        return () => {
            clearChatTitleBarModelState(sourceId);
        };
    }, [chatId, chatModelOptions, currentChatId, handleModelChange, runtimeChatMeta.modelName, sending]);

    return (
        <>
        <div className="fc relative h-full w-full">
            <div
                className="frbc absolute left-0 right-0 top-0 z-10 gap-2 px-3 py-2"
                style={{
                    backgroundColor: isDark ? 'rgba(12, 12, 12, 0.56)' : 'rgba(255, 255, 255, 0.76)',
                    backdropFilter: 'blur(18px)',
                    boxShadow: isDark
                        ? '0 10px 24px rgba(0, 0, 0, 0.16)'
                        : '0 8px 20px rgba(15, 23, 42, 0.06)'
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
                className="flex-1 overflow-y-auto px-4 pb-4 pt-16"
                style={{backgroundColor: isDark ? 'transparent' : '#ffffff'}}
            >
                <MessagesList
                    messages={currentBranch}
                    streamingContent={streamingContent}
                    showStreamingPlaceholder={sending}
                    streamingModelLevel={modelLevel}
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
                        onClick={sending ? handleStopResponse : () => void handleSendMessage()}
                        disabled={(!inputText.trim() && !sending) || isRecording || isTranscribing}
                        color="primary"
                        sx={{
                            backgroundColor: sending ? '#e11d48' : 'primary.main',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: sending ? '#be123c' : 'primary.dark'
                            },
                            '&.Mui-disabled': {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'var(--color-bg-tertiary)',
                                color: 'text.disabled'
                            }
                        }}
                    >
                        {sending ? (
                            <StopRoundedIcon sx={{color: 'white'}}/>
                        ) : (
                            <SendRoundedIcon sx={{transform: 'translateX(6%)'}}/>
                        )}
                    </IconButton>
                </div>
            </div>
        </div>
        <NoCreditsModal
            open={showNoCreditsModal}
            onClose={() => setShowNoCreditsModal(false)}
        />
        </>
    );
};

export default ChatViewPage;
