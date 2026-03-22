import React, {useCallback, useEffect, useLayoutEffect, useRef, useState, memo, useMemo} from 'react';
import {useLocation} from 'react-router-dom';
import {alpha, useTheme} from '@mui/material/styles';
import {CircularProgress, IconButton, TextField} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import type {WinkyChatMessage, MessageChildrenResponse} from '@shared/types';
import {useConfig} from '../../../context/ConfigContext';
import {useToast} from '../../../context/ToastContext';
import {useChats} from '../../../context/ChatsContext';
import LoadingSpinner from '../../../components/LoadingSpinner';
import NoCreditsModal from '../../../components/NoCreditsModal';
import ChatActions from './ChatActions';
import ChatMessage, {ChatThinkingPlaceholder} from './ChatMessage';
import useSmoothedStreamingContent from '../hooks/useSmoothedStreamingContent';
import {llmBridge} from '../../../services/winkyBridge';
import {
    fetchWinkyChatBranch,
    fetchWinkyChat,
    fetchMessageChildren,
    fetchMessageBranch,
    winkyLLMStream,
    winkyTranscribe,
    updateWinkyChat
} from '../../../services/winkyAiApi';
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
} from '../services/chatStorage';
import {
    consumeChatLaunchRequest,
    type ChatLaunchRequest
} from '../services/chatLaunchRequests';
import {createChatMeta, getChatModelOptions} from '../utils/chatProviders';
import {getChatModelPreference} from '../services/chatModelPreferences';
import {buildChatPrompt} from '../utils/chatPrompt';
import {
    clearChatTitleBarModelState,
    setChatTitleBarModelState
} from '../../../services/chatTitleBarState';

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
                const isThinkingPlaceholderMessage = message.role === 'assistant' &&
                    message.content.trim() === 'Thinking...' &&
                    message.id !== 'streaming' &&
                    message === messages[messages.length - 1] &&
                    !streamingContent;

                const mayHaveSiblings = siblingInfo
                    ? siblingInfo.total > 1
                    : (message.sibling_count > 0);

                const currentIndex = siblingInfo?.currentIndex ?? message.sibling_index;
                const totalSiblings = siblingInfo?.total ?? (message.sibling_count + 1);

                return (
                    <React.Fragment key={message.id}>
                        {isThinkingPlaceholderMessage ? (
                            <ChatThinkingPlaceholder/>
                        ) : (
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
                        )}
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

export interface ChatPanelProps {
    panelId: string;
    chatId: string;
    initialLeafMessageId?: string | null;
    onLeafChange?: (panelId: string, leafMessageId: string | null) => void;
    onClose?: (panelId: string) => void;
    onChatCreated?: (chatId: string, title: string) => void;
    canClose?: boolean;
    showDragHandle?: boolean;
    dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const ChatPanelComponent: React.FC<ChatPanelProps> = ({
    panelId,
    chatId,
    initialLeafMessageId,
    onLeafChange,
    onClose,
    onChatCreated,
    canClose = true,
    showDragHandle = false,
    dragHandleProps
}) => {
    const isNewChat = chatId === 'new';
    const location = useLocation();
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
    const [currentChatId, setCurrentChatId] = useState<string | null>(isNewChat ? null : chatId);
    const [normalizedVolume, setNormalizedVolume] = useState(0);
    const [chatTitle, setChatTitle] = useState('');

    const [leafMessageId, setLeafMessageId] = useState<string | null>(initialLeafMessageId || null);
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
    const skipRemoteHydrationChatIdRef = useRef<string | null>(null);
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

    const targetChatId = isNewChat ? currentChatId : chatId || currentChatId;

    const storedChat = useMemo(() => {
        if (!targetChatId) {
            return null;
        }
        return getLocalChat(targetChatId)?.chat || getRemoteDraftChat(targetChatId)?.chat || null;
    }, [targetChatId]);

    const activeChat = useMemo(() => {
        if (!targetChatId) {
            return null;
        }
        return chats.find((chat) => chat.id === targetChatId) || null;
    }, [chats, targetChatId]);

    const chatModelPreference = useMemo(() => {
        if (!targetChatId) {
            return null;
        }
        return getChatModelPreference(targetChatId);
    }, [targetChatId, activeChat?.model_name, activeChat?.llm_mode]);

    const runtimeChatMeta = useMemo(() => {
        const chatMetaSource = activeChat || storedChat;
        const preferredModelName = chatMetaSource?.model_name || chatModelPreference?.model_name || null;
        const preferredLlmMode = chatMetaSource?.llm_mode || chatModelPreference?.llm_mode || null;
        if (chatMetaSource?.llm_mode && chatMetaSource.model_name) {
            return {
                storage: chatMetaSource.storage || 'remote',
                provider: chatMetaSource.provider || 'winky',
                llmMode: chatMetaSource.llm_mode,
                modelName: chatMetaSource.model_name
            };
        }
        if (chatMetaSource && preferredModelName && preferredLlmMode) {
            const chatMeta = createChatMeta(preferredLlmMode, preferredModelName);
            return {
                storage: chatMetaSource.storage || chatMeta.storage,
                provider: chatMetaSource.provider || chatMeta.provider,
                llmMode: preferredLlmMode,
                modelName: preferredModelName
            };
        }
        if (chatMetaSource?.storage === 'remote') {
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
                llmMode: chatMeta.llm_mode,
                modelName: chatMeta.model_name
            };
        }
        const nextMode = config?.llm?.mode || 'api';
        const nextModel = config?.llm?.model || 'winky-high';
        const chatMeta = createChatMeta(nextMode, nextModel);
        return {
            storage: chatMetaSource?.storage || chatMeta.storage,
            provider: chatMetaSource?.provider || chatMeta.provider,
            llmMode: chatMetaSource?.llm_mode || chatMeta.llm_mode,
            modelName: chatMetaSource?.model_name || chatMeta.model_name
        };
    }, [activeChat, storedChat, chatModelPreference, config?.llm?.mode, config?.llm?.model, launchRequest]);

    const modelLevel = useMemo(
        (): 'low' | 'mid' | 'high' => getWinkyModelLevel(runtimeChatMeta.modelName),
        [runtimeChatMeta.modelName]
    );

    const preferredChatTitle = activeChat?.title || storedChat?.title || launchRequest?.preferredTitle || '';
    const chatAdditionalContext = activeChat?.additional_context || storedChat?.additional_context || launchRequest?.additionalContext || '';
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
            setCurrentBranch(
                mergeMessages(
                    ...(pendingRequest.messagesBeforeEdit || []),
                    userMessage,
                    ...(assistantMessage ? [assistantMessage] : [])
                )
            );
        } else {
            setCurrentBranch((prev) => {
                const filtered = prev.filter((message) => message.id !== pendingRequest.tempUserMessageId);
                return mergeMessages(
                    ...filtered,
                    userMessage,
                    ...(assistantMessage ? [assistantMessage] : [])
                );
            });
        }

        if (pendingRequest.startedUserMessageId) {
            if (!currentChatId && pendingRequest.startedChatId) {
                setCurrentChatId(pendingRequest.startedChatId);
                addChat({
                    id: pendingRequest.startedChatId,
                    title: preferredChatTitle,
                    additional_context: chatAdditionalContext,
                    message_count: assistantMessage ? 2 : 1,
                    last_leaf_message_id: pendingRequest.startedUserMessageId,
                    pinned_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
                onChatCreated?.(pendingRequest.startedChatId, preferredChatTitle);
            }
            setLeafMessageId(pendingRequest.startedUserMessageId);
            onLeafChange?.(panelId, pendingRequest.startedUserMessageId);
        }
    }, [modelLevel, onLeafChange, panelId, currentChatId, addChat, onChatCreated, getStreamingContent, preferredChatTitle, chatAdditionalContext]);

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
                setCurrentBranch((prev) => mergeMessages(...response.items, ...prev));
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
                onLeafChange?.(panelId, response.leaf_message_id);
            }

            setHasMoreMessages(response.has_more);
            setNextCursor(response.next_cursor);
        } catch (error) {
            console.error('[ChatPanel] Failed to load branch', error);
            if (!isLoadingMore) {
                showToast('Failed to load messages.', 'error');
            }
        } finally {
            if (isLoadingMore) {
                setLoadingMore(false);
            }
        }
    }, [accessToken, currentChatId, showToast, panelId, onLeafChange]);

    // Используем ref для initialLeafMessageId, чтобы избежать повторных загрузок
    // когда onLeafChange обновляет leafMessageId в панели
    const initialLeafRef = useRef(initialLeafMessageId);

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
        const isPendingStartedChat = skipRemoteHydrationChatIdRef.current === chatId;
        if (isPendingStartedChat) {
            setCurrentChatId(chatId);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const localChat = getLocalChat(chatId);
            if (localChat) {
                const localBranch = getLocalChatBranch(chatId, initialLeafRef.current || localChat.chat.last_leaf_message_id);
                const nextLeafMessageId = localBranch[localBranch.length - 1]?.id || localChat.chat.last_leaf_message_id;
                setChatTitle(localChat.chat.title || '');
                setCurrentChatId(chatId);
                setCurrentBranch(localBranch);
                setLeafMessageId(nextLeafMessageId);
                setSiblingsData(new Map());
                setHasMoreMessages(false);
                setNextCursor(null);
                onLeafChange?.(panelId, nextLeafMessageId);
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
                onLeafChange?.(panelId, remoteDraftChat.chat.last_leaf_message_id);
                return;
            }

            if (chatId.startsWith('local-chat-')) {
                setCurrentChatId(chatId);
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

            const leafToLoad = initialLeafRef.current || chatResponse.last_leaf_message_id || undefined;

            const branchResponse = await fetchWinkyChatBranch(chatId, accessToken, {
                leafMessageId: leafToLoad,
                limit: 20
            });

            setCurrentBranch(branchResponse.items);
            setLeafMessageId(branchResponse.leaf_message_id);
            setHasMoreMessages(branchResponse.has_more);
            setNextCursor(branchResponse.next_cursor);

            if (branchResponse.leaf_message_id) {
                onLeafChange?.(panelId, branchResponse.leaf_message_id);
            }
        } catch (error) {
            console.error('[ChatPanel] Failed to load messages', error);
            showToast('Failed to load messages.', 'error');
        } finally {
            setLoading(false);
        }
    }, [accessToken, chatId, isNewChat, showToast, panelId, onLeafChange]);

    // Синхронизируем состояние при смене chatId prop
    const prevChatIdRef = useRef(chatId);
    useEffect(() => {
        if (chatId !== prevChatIdRef.current) {
            prevChatIdRef.current = chatId;
            // Обновляем ref для initial leaf при смене чата
            initialLeafRef.current = initialLeafMessageId;
            const isPendingStartedChat = !isNewChat && skipRemoteHydrationChatIdRef.current === chatId;
            if (isPendingStartedChat) {
                setCurrentChatId(chatId);
                setLoading(false);
                return;
            }
            setCurrentChatId(isNewChat ? null : chatId);
            // Сбрасываем состояние для нового чата
            setCurrentBranch([]);
            setChatTitle('');
            setLeafMessageId(null);
            setSiblingsData(new Map());
            setLoading(!isNewChat);
        }
    }, [chatId, isNewChat, initialLeafMessageId]);

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
        const targetId = chatId || null;
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
                onLeafChange?.(panelId, nextLeafMessageId);
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
            onLeafChange?.(panelId, remoteDraftChat.chat.last_leaf_message_id);
            setLoading(false);
        };

        syncStoredChat();
        return subscribeChatStorage(syncStoredChat);
    }, [chatId, isNewChat, panelId, onLeafChange]);

    useLayoutEffect(() => {
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
            console.error('[ChatPanel] Failed to load siblings', error);
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
            onLeafChange?.(panelId, userMessageId);
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
                    message_count: localRecord.messages.length + 2
                });
                const nextBranch = getLocalChatBranch(localChatId, assistantMessageId);
                setCurrentBranch(nextBranch);
                setLeafMessageId(assistantMessageId);
                onLeafChange?.(panelId, assistantMessageId);

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
                        onLeafChange?.(panelId, assistantMessageId);
                    } else {
                        const nextBranch = getLocalChatBranch(localChatId, userMessageId);
                        setCurrentBranch(nextBranch);
                        setLeafMessageId(userMessageId);
                        onLeafChange?.(panelId, userMessageId);
                    }
                    return;
                }

                console.error('[ChatPanel] Failed to send edited local message', error);
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
        let startedChatId = currentChatId;
        let chatOpenedFromStart = Boolean(currentChatId);
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
                            skipRemoteHydrationChatIdRef.current = chat_id;
                            startedChatId = chat_id;
                            setCurrentBranch((prev) => replacePendingUserMessage(prev, tempUserMessage.id, {
                                ...tempUserMessage,
                                id: user_message_id,
                                has_children: true
                            }));
                            if (!chatOpenedFromStart) {
                                chatOpenedFromStart = true;
                                setCurrentChatId(chat_id);
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
                                onChatCreated?.(chat_id, preferredChatTitle);
                            }
                        }
                    }
                }
            );

            flushStreamingContent();

            if (!chatOpenedFromStart && result.chat_id) {
                setCurrentChatId(result.chat_id);
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
                onChatCreated?.(result.chat_id, preferredChatTitle);
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

            const chatIdToSave = startedChatId || result.chat_id;
            if (chatIdToSave) {
                onLeafChange?.(panelId, result.assistant_message_id);
            }

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
            console.error('[ChatPanel] Failed to send edited message', error);
            setCurrentBranch(currentBranch);

            if (error?.isCreditsError || error?.code === 'not_enough_credits' || error?.response?.status === 402) {
                setShowNoCreditsModal(true);
            } else {
                showToast(error?.message || 'Failed to send message.', 'error');
            }
        } finally {
            llmAbortControllerRef.current = null;
            skipRemoteHydrationChatIdRef.current = null;
            pendingRequestRef.current = null;
            setSending(false);
            resetStreamingContent();
        }
    }, [runtimeChatMeta, editText, accessToken, sending, editingMessageId, currentBranch, currentChatId, showToast, addChat, loadSiblings, panelId, onLeafChange, onChatCreated, appendStreamingChunk, flushStreamingContent, getStreamingContent, resetStreamingContent, scrollToBottom, handleAbortedRequest, preferredChatTitle, chatAdditionalContext, modelLevel, config?.apiKeys.google, config?.apiKeys.openai]);

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
                onLeafChange?.(panelId, nextLeafMessageId);
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
                console.error('[ChatPanel] Failed to switch local branch', error);
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

            if (response.items.length <= 1) return;
        }

        const newIndex = direction === 'prev'
            ? siblingInfo.currentIndex - 1
            : siblingInfo.currentIndex + 1;

        if (newIndex < 0 || newIndex >= siblingInfo.items.length) return;

        const newMessage = siblingInfo.items[newIndex];

        const messageIndex = currentBranch.findIndex(m => m.id === message.id);
        if (messageIndex < 0) return;

        const originalBranch = [...currentBranch];
        const container = messagesContainerRef.current;
        const scrollTopBefore = container?.scrollTop || 0;

        const messagesUpToSwitch = currentBranch.slice(0, messageIndex + 1);
        setCurrentBranch(messagesUpToSwitch);
        setSwitchingBranchAtMessageId(message.id);

        try {
            const branchResponse = await fetchMessageBranch(newMessage.id, accessToken);

            const messagesBeforeSwitch = currentBranch.slice(0, messageIndex);
            const existingIds = new Set(messagesBeforeSwitch.map(m => m.id));
            const newBranchFromSwitch = branchResponse.items.filter(m => !existingIds.has(m.id));

            const newFullBranch = [...messagesBeforeSwitch, ...newBranchFromSwitch];
            setCurrentBranch(newFullBranch);

            requestAnimationFrame(() => {
                if (container) {
                    container.scrollTop = scrollTopBefore;
                }
                skipNextScrollToBottom.current = true;
                setSwitchingBranchAtMessageId(null);
            });

            const lastMessage = newBranchFromSwitch[newBranchFromSwitch.length - 1];
            if (lastMessage) {
                setLeafMessageId(lastMessage.id);
                onLeafChange?.(panelId, lastMessage.id);
            }

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

            setHasMoreMessages(false);
            setNextCursor(null);
        } catch (error) {
            console.error('[ChatPanel] Failed to switch branch', error);
            showToast('Failed to switch branch.', 'error');
            setCurrentBranch(originalBranch);
            setSwitchingBranchAtMessageId(null);
        }
    }, [runtimeChatMeta.storage, siblingsData, loadSiblings, currentBranch, currentChatId, accessToken, showToast, panelId, onLeafChange]);

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
            onLeafChange?.(panelId, userMessageId);

            if (!currentChatId) {
                setCurrentChatId(localChatId);
                onChatCreated?.(localChatId, localChatTitle);
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
                onLeafChange?.(panelId, assistantMessageId);
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
                        onLeafChange?.(panelId, assistantMessageId);
                    } else {
                        const nextBranch = getLocalChatBranch(localChatId, userMessageId);
                        setCurrentBranch(nextBranch);
                        setLeafMessageId(userMessageId);
                        onLeafChange?.(panelId, userMessageId);
                    }
                    return;
                }
                console.error('[ChatPanel] Failed to send local chat message', error);
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
        let startedChatId = currentChatId;
        let chatOpenedFromStart = Boolean(currentChatId);
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
                            skipRemoteHydrationChatIdRef.current = chat_id;
                            startedChatId = chat_id;
                            setCurrentBranch((prev) => replacePendingUserMessage(prev, tempUserMessage.id, {
                                ...tempUserMessage,
                                id: user_message_id,
                                has_children: true
                            }));
                            if (!chatOpenedFromStart) {
                                chatOpenedFromStart = true;
                                setCurrentChatId(chat_id);
                                addChat({
                                    id: chat_id,
                                    title: preferredChatTitle,
                                    additional_context: chatAdditionalContext,
                                    message_count: 1,
                                    last_leaf_message_id: user_message_id,
                                    pinned_at: null,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                });
                                onChatCreated?.(chat_id, preferredChatTitle);
                            }
                        }
                    }
                }
            );

            flushStreamingContent();

            if (!chatOpenedFromStart && result.chat_id) {
                setCurrentChatId(result.chat_id);
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
                onChatCreated?.(result.chat_id, preferredChatTitle);
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

            const chatIdToSave = startedChatId || result.chat_id;
            if (chatIdToSave) {
                onLeafChange?.(panelId, result.assistant_message_id);
            }
        } catch (error: any) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                handleAbortedRequest();
                return;
            }
            console.error('[ChatPanel] Failed to send message', error);
            setCurrentBranch((prev) => prev.filter((m) => !m.id.startsWith('temp-')));

            if (error?.isCreditsError || error?.code === 'not_enough_credits' || error?.response?.status === 402) {
                setShowNoCreditsModal(true);
            } else {
                showToast(error?.message || 'Failed to send message.', 'error');
            }
        } finally {
            llmAbortControllerRef.current = null;
            skipRemoteHydrationChatIdRef.current = null;
            pendingRequestRef.current = null;
            setSending(false);
            resetStreamingContent();
        }
    }, [runtimeChatMeta, inputText, accessToken, sending, currentBranch, currentChatId, showToast, addChat, activeChat, panelId, onLeafChange, onChatCreated, appendStreamingChunk, flushStreamingContent, getStreamingContent, getLastPersistedMessage, resetStreamingContent, scrollToBottom, handleAbortedRequest, modelLevel, preferredChatTitle, chatAdditionalContext, config?.apiKeys.google, config?.apiKeys.openai]);

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
            console.error('[ChatPanel] Failed to initialize volume monitor', error);
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
                    console.error('[ChatPanel] Transcription failed', error);
                    if (error?.isCreditsError || error?.code === 'not_enough_credits' || error?.response?.status === 402) {
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
            console.error('[ChatPanel] Failed to start recording', error);
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
            console.error('[ChatPanel] Failed to rename chat', error);
            showToast('Failed to rename chat.', 'error');
            throw error;
        }
    }, [accessToken, currentChatId, runtimeChatMeta.storage, showToast, updateChatInContext]);

    const handleDeleteChat = useCallback(async () => {
        if (!currentChatId) return;
        try {
            await deleteChatFromContext(currentChatId);
            showToast('Chat deleted.', 'success');
            onClose?.(panelId);
        } catch (error) {
            console.error('[ChatPanel] Failed to delete chat', error);
            showToast('Failed to delete chat.', 'error');
            throw error;
        }
    }, [currentChatId, showToast, deleteChatFromContext, onClose, panelId]);

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
        const routeChatId = location.pathname.startsWith('/chats/') ? location.pathname.slice('/chats/'.length) : null;
        const activeRouteChatId = routeChatId || null;
        const resolvedChatId = currentChatId || chatId;
        const sourceId = `chat-panel:${panelId}`;
        if (!resolvedChatId || !activeRouteChatId || resolvedChatId !== activeRouteChatId) {
            clearChatTitleBarModelState(sourceId);
            return;
        }
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
    }, [chatId, chatModelOptions, currentChatId, handleModelChange, location.pathname, panelId, runtimeChatMeta.modelName, sending]);

    const handleClosePanel = useCallback(() => {
        onClose?.(panelId);
    }, [onClose, panelId]);

    return (
        <>
        <div className="fc relative h-full w-full border-r last:border-r-0" style={{borderColor: isDark ? darkSurface : 'var(--color-border-light)'}}>
            {/* Header */}
            <div
                className="frbc absolute left-0 right-0 top-0 z-10 gap-2 px-3 py-2"
                style={{
                    boxShadow: isDark
                        ? '0 10px 24px rgba(0, 0, 0, 0.16)'
                        : ''
                }}
            >
                <div className="frsc gap-2 min-w-0 flex-1">
                    {showDragHandle && (
                        <div
                            {...dragHandleProps}
                            className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                        >
                            <DragIndicatorRoundedIcon sx={{fontSize: 18, color: 'text.secondary'}}/>
                        </div>
                    )}
                </div>
                <div className="frsc gap-1">
                    {!isNewChat && currentChatId && (
                        <ChatActions
                            chatTitle={chatTitle || 'Chat'}
                            onRename={handleRenameChat}
                            onDelete={handleDeleteChat}
                            disabled={sending}
                            compact
                        />
                    )}
                    {canClose && (
                        <IconButton
                            onClick={handleClosePanel}
                            size="small"
                            sx={{
                                padding: '3px',
                                '&:hover': {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                                }
                            }}
                        >
                            <CloseRoundedIcon sx={{fontSize: 16}}/>
                        </IconButton>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-3 pb-3 pt-16"
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

            {/* Input */}
            <div
                className="px-3 py-2 border-t flex-shrink-0"
                style={{
                    borderColor: isDark ? darkSurface : 'var(--color-border-light)',
                    backgroundColor: isDark ? 'transparent' : '#ffffff'
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
                        maxRows={6}
                        minRows={1}
                        slotProps={{htmlInput: {ref: inputRef}}}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '10px',
                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)',
                                padding: '8px 12px 2px 12px',
                                minHeight: '38px',
                                fontSize: '0.875rem',
                                outline: 'none',
                                boxShadow: 'none',
                                '& fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
                                },
                                '&:hover fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                                },
                                '&.Mui-focused': {
                                    backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)',
                                    outline: 'none',
                                    boxShadow: 'none'
                                },
                                '&.Mui-focused fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
                                    borderWidth: '1px',
                                    boxShadow: 'none'
                                }
                            },
                            '& .MuiInputBase-input': {
                                padding: 0,
                                lineHeight: 1.4,
                                outline: 'none',
                                boxShadow: 'none',
                                '&:focus': {
                                    outline: 'none',
                                    boxShadow: 'none'
                                },
                                '&::-webkit-scrollbar': {
                                    width: '2px'
                                },
                                '&::-webkit-scrollbar-track': {
                                    background: 'transparent'
                                },
                                '&::-webkit-scrollbar-thumb': {
                                    background: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
                                    borderRadius: '1px'
                                }
                            }
                        }}
                    />

                    <div style={{position: 'relative', flexShrink: 0, width: 34, height: 34}}>
                        <MicWaves isRecording={isRecording} normalizedVolume={normalizedVolume}/>
                        <IconButton
                            onClick={handleMicClick}
                            disabled={isTranscribing}
                            sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                zIndex: 1,
                                width: 34,
                                height: 34,
                                padding: 0,
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
                                <StopRoundedIcon sx={{fontSize: 20, color: 'white'}}/>
                            ) : isTranscribing ? (
                                <CircularProgress size={20} color="inherit"/>
                            ) : (
                                <MicRoundedIcon sx={{fontSize: 20}}/>
                            )}
                        </IconButton>
                    </div>

                    <IconButton
                        onClick={sending ? handleStopResponse : () => void handleSendMessage()}
                        disabled={(!inputText.trim() && !sending) || isRecording || isTranscribing}
                        color="primary"
                        size="small"
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
                            <StopRoundedIcon sx={{fontSize: 20, color: 'white'}}/>
                        ) : (
                            <SendRoundedIcon sx={{fontSize: 20, transform: 'translateX(6%)'}}/>
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

export const ChatPanel = memo(ChatPanelComponent);
export default ChatPanel;
