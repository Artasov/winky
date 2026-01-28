import React, {useCallback, useEffect, useRef, useState, memo} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {alpha, useTheme} from '@mui/material/styles';
import {CircularProgress, IconButton, TextField} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import type {WinkyChatMessage} from '@shared/types';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ChatActions from '../features/chats/components/ChatActions';
import ChatMessage from '../features/chats/components/ChatMessage';
import {
    fetchWinkyChatMessages,
    fetchWinkyChat,
    winkyLLMStream,
    winkyTranscribe,
    updateWinkyChat,
    deleteWinkyChat
} from '../services/winkyAiApi';

// Компонент волн вокруг кнопки микрофона
interface MicWavesProps {
    isRecording: boolean;
    normalizedVolume: number;
}

const MicWavesComponent: React.FC<MicWavesProps> = ({isRecording, normalizedVolume}) => {
    // 2 кольца, близко к кнопке
    const ringMultipliers = [2, 1];
    const buttonSize = 40;
    const firstRingSize = buttonSize + 4;

    // Усиливаем громкость для большей чувствительности
    const amplifiedVolume = Math.min(1, normalizedVolume * 5);
    const sqrtVolume = Math.sqrt(amplifiedVolume);

    const baseWaveScale = 1.02;
    const maxAdditionalScale = 0.25;
    const waveScale = baseWaveScale + sqrtVolume * maxAdditionalScale;

    // Очень низкий порог для срабатывания при тихих звуках
    const minVolumeThreshold = 0.02;

    if (!isRecording) return null;

    // rose-600 = rgb(225, 29, 72)
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

// Мемоизированный список сообщений - не перерендеривается при изменении inputText
interface MessagesListProps {
    messages: WinkyChatMessage[];
    streamingContent: string;
    loading: boolean;
}

const MessagesListComponent: React.FC<MessagesListProps> = ({messages, streamingContent, loading}) => {
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
            {messages.map((message) => (
                <ChatMessage key={message.id} message={message}/>
            ))}

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
                        created_at: new Date().toISOString()
                    }}
                    isStreaming
                />
            )}
        </div>
    );
};

const MessagesList = memo(MessagesListComponent);

// Тип сообщения с детьми для построения дерева
type MessageNode = WinkyChatMessage & {children: MessageNode[]};

// Построение дерева сообщений
const buildMessageTree = (messages: WinkyChatMessage[]) => {
    const byId = new Map<string, MessageNode>();
    const roots: MessageNode[] = [];

    for (const m of messages) {
        byId.set(m.id, {...m, children: []});
    }

    for (const m of messages) {
        const node = byId.get(m.id)!;
        if (!m.parent_id) {
            roots.push(node);
        } else {
            const parent = byId.get(m.parent_id);
            if (parent) {
                parent.children.push(node);
            }
        }
    }

    return {roots, byId};
};

// Получение ветки по умолчанию (последние сообщения по времени)
const getDefaultBranch = (roots: MessageNode[]): WinkyChatMessage[] => {
    if (roots.length === 0) return [];

    const branch: WinkyChatMessage[] = [];
    let current: MessageNode | undefined = roots.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    while (current) {
        branch.push(current);
        if (current.children.length === 0) break;
        current = current.children.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
    }

    return branch;
};

const ChatViewPage: React.FC = () => {
    const {chatId} = useParams<{chatId: string}>();
    const isNewChat = chatId === 'new';
    const navigate = useNavigate();
    const {showToast} = useToast();
    const {config} = useConfig();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.12);

    const [allMessages, setAllMessages] = useState<WinkyChatMessage[]>([]);
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

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);

    const accessToken = config?.auth?.access || config?.auth?.accessToken || '';

    const scrollToBottom = useCallback(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, []);

    const loadMessages = useCallback(async () => {
        if (!accessToken || !chatId || isNewChat) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [messagesResponse, chatResponse] = await Promise.all([
                fetchWinkyChatMessages(chatId, accessToken),
                fetchWinkyChat(chatId, accessToken)
            ]);
            const messages = messagesResponse.items;
            setAllMessages(messages);
            setChatTitle(chatResponse.title || '');

            const {roots} = buildMessageTree(messages);
            const branch = getDefaultBranch(roots);
            setCurrentBranch(branch);
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
        scrollToBottom();
    }, [currentBranch, streamingContent, scrollToBottom]);

    // Остановка записи при размонтировании компонента (смена вкладки)
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

    const handleSendMessage = useCallback(async () => {
        const text = inputText.trim();
        if (!text || !accessToken || sending) return;

        setSending(true);
        setInputText('');
        setStreamingContent('');

        // Определяем parent_message_id (последнее сообщение в текущей ветке)
        const lastMessage = currentBranch.length > 0 ? currentBranch[currentBranch.length - 1] : null;
        const parentMessageId = lastMessage?.id || null;

        // Добавляем пользовательское сообщение оптимистично
        const tempUserMessage: WinkyChatMessage = {
            id: `temp-user-${Date.now()}`,
            parent_id: parentMessageId,
            role: 'user',
            content: text,
            model_level: 'high',
            tokens: 0,
            has_children: false,
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

            // Если это был новый чат, обновляем chatId и URL
            if (!currentChatId && result.chat_id) {
                setCurrentChatId(result.chat_id);
                navigate(`/chats/${result.chat_id}`, {replace: true});
            }

            // Создаем реальные сообщения
            const userMessage: WinkyChatMessage = {
                id: result.user_message_id,
                parent_id: parentMessageId,
                role: 'user',
                content: text,
                model_level: 'high',
                tokens: 0,
                has_children: true,
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
                created_at: new Date().toISOString()
            };

            // Обновляем ветку
            setCurrentBranch((prev) => {
                const filtered = prev.filter((m) => !m.id.startsWith('temp-'));
                return [...filtered, userMessage, assistantMessage];
            });

            // Обновляем все сообщения
            setAllMessages((prev) => [...prev, userMessage, assistantMessage]);

            setStreamingContent('');
        } catch (error: any) {
            console.error('[ChatViewPage] Failed to send message', error);

            // Удаляем временное сообщение при ошибке
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
    }, [inputText, accessToken, sending, currentBranch, currentChatId, navigate, showToast]);

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
            showToast('Chat renamed.', 'success');
        } catch (error) {
            console.error('[ChatViewPage] Failed to rename chat', error);
            showToast('Failed to rename chat.', 'error');
            throw error;
        }
    }, [accessToken, currentChatId, showToast]);

    const handleDeleteChat = useCallback(async () => {
        if (!accessToken || !currentChatId) return;
        try {
            await deleteWinkyChat(currentChatId, accessToken);
            showToast('Chat deleted.', 'success');
            navigate('/chats');
        } catch (error) {
            console.error('[ChatViewPage] Failed to delete chat', error);
            showToast('Failed to delete chat.', 'error');
            throw error;
        }
    }, [accessToken, currentChatId, navigate, showToast]);

    return (
        <div className="fc h-full w-full">
            {/* Header */}
            <div
                className="frbc gap-3 px-4 py-3 border-b flex-shrink-0"
                style={{
                    borderColor: isDark ? darkSurface : 'var(--color-border-light)',
                    backgroundColor: isDark ? 'transparent' : 'var(--color-bg-elevated)'
                }}
            >
                <div className="frsc gap-3 min-w-0 flex-1">
                    <IconButton onClick={handleBack} size="small">
                        <ArrowBackRoundedIcon/>
                    </IconButton>
                    <h1 className="text-lg font-semibold text-text-primary truncate">
                        {isNewChat ? 'New Chat' : chatTitle || 'Chat'}
                    </h1>
                </div>
                {!isNewChat && currentChatId && (
                    <ChatActions
                        chatTitle={chatTitle || 'Chat'}
                        onRename={handleRenameChat}
                        onDelete={handleDeleteChat}
                        disabled={sending}
                    />
                )}
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
                <MessagesList
                    messages={currentBranch}
                    streamingContent={streamingContent}
                    loading={loading}
                />
            </div>

            {/* Input */}
            <div
                className="px-4 py-3 border-t flex-shrink-0"
                style={{
                    borderColor: isDark ? darkSurface : 'var(--color-border-light)',
                    backgroundColor: isDark ? 'transparent' : 'var(--color-bg-elevated)',
                    overflow: 'visible'
                }}
            >
                <div className="frsc gap-2">
                    <TextField
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isRecording ? 'Recording...' : isTranscribing ? 'Transcribing...' : 'Type a message...'}
                        disabled={sending || isTranscribing}
                        fullWidth
                        multiline
                        maxRows={10}
                        minRows={1}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '12px',
                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)',
                                padding: '10px 14px 3px 14px',
                                minHeight: '42px',
                                '& fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
                                },
                                '&:hover fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                                },
                                '&.Mui-focused fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'var(--color-primary)',
                                    borderWidth: '1px',
                                    boxShadow: 'none'
                                },
                                '&.Mui-focused': {
                                    boxShadow: 'none'
                                },
                                '&.Mui-error fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'var(--color-primary)'
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
                            disabled={sending || isTranscribing}
                            sx={{
                                position: 'relative',
                                zIndex: 1,
                                backgroundColor: isRecording
                                    ? '#e11d48' // rose-600
                                    : isDark ? 'rgba(255,255,255,0.1)' : 'var(--color-bg-tertiary)',
                                '&:hover': {
                                    backgroundColor: isRecording
                                        ? '#be123c' // rose-700
                                        : isDark ? 'rgba(255,255,255,0.15)' : 'var(--color-bg-secondary)'
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
                            <SendRoundedIcon/>
                        )}
                    </IconButton>
                </div>
            </div>
        </div>
    );
};

export default ChatViewPage;
