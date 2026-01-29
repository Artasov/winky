import React, {useCallback, useRef, useState, memo} from 'react';
import ReactMarkdown from 'react-markdown';
import type {Components} from 'react-markdown';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {oneDark, oneLight} from 'react-syntax-highlighter/dist/esm/styles/prism';
import {alpha, useTheme} from '@mui/material/styles';
import {Button, IconButton, TextField, Tooltip} from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import type {WinkyChatMessage} from '@shared/types';
import {clipboardBridge} from '../../../services/winkyBridge';

const markdownComponentsCache = new Map<boolean, Components>();

interface ChatMessageProps {
    message: WinkyChatMessage;
    isStreaming?: boolean;
    isEditing?: boolean;
    editText?: string;
    onEditStart?: (message: WinkyChatMessage) => void;
    onEditChange?: (text: string) => void;
    onEditSubmit?: () => void;
    onEditCancel?: () => void;
    siblingIndex?: number;
    siblingsTotal?: number;
    onSiblingPrev?: () => void;
    onSiblingNext?: () => void;
}

const formatTime = (value: string): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
};

const CodeBlockCopyButton: React.FC<{code: string}> = ({code}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        await clipboardBridge.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [code]);

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="code-block-copy-btn"
            aria-label="Copy code"
        >
            {copied ? (
                <CheckRoundedIcon sx={{fontSize: 14, color: 'success.main'}}/>
            ) : (
                <ContentCopyRoundedIcon sx={{fontSize: 14}}/>
            )}
        </button>
    );
};

const getMarkdownComponents = (isDark: boolean): Components => {
    const cached = markdownComponentsCache.get(isDark);
    if (cached) return cached;

    const components: Components = {
        code: ({className, children, ...props}) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !match && !codeString.includes('\n');

            if (isInline) {
                return (
                    <code className={className} {...props}>
                        {children}
                    </code>
                );
            }

            return (
                <div className="code-block-wrapper">
                    <CodeBlockCopyButton code={codeString}/>
                    <SyntaxHighlighter
                        style={isDark ? oneDark : oneLight}
                        language={language || 'text'}
                        PreTag="div"
                        wrapLines={false}
                        customStyle={{
                            margin: 0,
                            padding: '0.6rem 0.75rem',
                            paddingRight: '2.5rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            background: isDark ? 'rgba(0, 0, 0, 0.3)' : '#ffffff',
                            border: 'none'
                        }}
                        codeTagProps={{
                            style: {
                                background: 'transparent',
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }}
                        lineProps={{
                            style: {
                                background: 'transparent',
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }}
                    >
                        {codeString}
                    </SyntaxHighlighter>
                </div>
            );
        },
        pre: ({children}) => <>{children}</>
    };

    markdownComponentsCache.set(isDark, components);
    return components;
};

interface BranchNavigatorProps {
    currentIndex: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
    isDark: boolean;
}

const BranchNavigator: React.FC<BranchNavigatorProps> = ({currentIndex, total, onPrev, onNext, isDark}) => {
    // total = 0 означает что siblings ещё не загружены
    const isLoaded = total > 0;
    const displayIndex = isLoaded ? currentIndex + 1 : '?';
    const displayTotal = isLoaded ? total : '?';

    return (
        <div className="frsc gap-0.5">
            <IconButton
                size="small"
                onClick={onPrev}
                disabled={!isLoaded || currentIndex <= 0}
                sx={{
                    padding: '2px',
                    '&:hover': {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    }
                }}
            >
                <ChevronLeftRoundedIcon sx={{fontSize: 16, color: 'text.secondary'}}/>
            </IconButton>
            <span className="text-xs text-text-tertiary min-w-[32px] text-center">
                {displayIndex}/{displayTotal}
            </span>
            <IconButton
                size="small"
                onClick={onNext}
                disabled={!isLoaded || currentIndex >= total - 1}
                sx={{
                    padding: '2px',
                    '&:hover': {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    }
                }}
            >
                <ChevronRightRoundedIcon sx={{fontSize: 16, color: 'text.secondary'}}/>
            </IconButton>
        </div>
    );
};

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
    message,
    isStreaming,
    isEditing,
    editText,
    onEditStart,
    onEditChange,
    onEditSubmit,
    onEditCancel,
    siblingIndex,
    siblingsTotal,
    onSiblingPrev,
    onSiblingNext
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.12);

    const [copiedRaw, setCopiedRaw] = useState(false);
    const [copiedText, setCopiedText] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const isUser = message.role === 'user';

    const handleCopyRaw = useCallback(async () => {
        await clipboardBridge.writeText(message.content);
        setCopiedRaw(true);
        setTimeout(() => setCopiedRaw(false), 2000);
    }, [message.content]);

    const handleCopyText = useCallback(async () => {
        const text = contentRef.current?.innerText || message.content;
        await clipboardBridge.writeText(text);
        setCopiedText(true);
        setTimeout(() => setCopiedText(false), 2000);
    }, [message.content]);

    const handleEditClick = useCallback(() => {
        onEditStart?.(message);
    }, [message, onEditStart]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onEditSubmit?.();
        } else if (e.key === 'Escape') {
            onEditCancel?.();
        }
    }, [onEditSubmit, onEditCancel]);

    const markdownComponents = getMarkdownComponents(isDark);

    if (isEditing && isUser) {
        return (
            <div className="fc gap-2 items-end w-full">
                <div
                    className="rounded-2xl px-4 py-3 w-full"
                    style={{
                        maxWidth: '85%',
                        backgroundColor: isDark ? alpha('#6f6f6f', 0.2) : 'rgba(0,0,0,0.05)',
                        marginLeft: 'auto'
                    }}
                >
                    <TextField
                        value={editText}
                        onChange={(e) => onEditChange?.(e.target.value)}
                        onKeyDown={handleKeyDown}
                        fullWidth
                        multiline
                        maxRows={10}
                        minRows={2}
                        autoFocus
                        placeholder="Edit message..."
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '8px',
                                backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
                                fontSize: '0.875rem',
                                '& fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
                                },
                                '&:hover fieldset': {
                                    borderColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'
                                },
                                '&.Mui-focused fieldset': {
                                    borderColor: 'primary.main',
                                    borderWidth: '1px'
                                }
                            }
                        }}
                    />
                    <div className="frec gap-2 mt-2">
                        <Button
                            size="small"
                            onClick={onEditCancel}
                            sx={{
                                textTransform: 'none',
                                color: 'text.secondary',
                                fontSize: '0.8125rem'
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="small"
                            variant="contained"
                            onClick={onEditSubmit}
                            disabled={!editText?.trim()}
                            sx={{
                                textTransform: 'none',
                                fontSize: '0.8125rem'
                            }}
                        >
                            Send
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`fc gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
            <div
                className={`rounded-2xl px-4 py-2 ${isUser ? 'bg-primary text-white' : ''}`}
                style={{
                    maxWidth: '85%',
                    minWidth: '80px',
                    ...(!isUser && {
                        backgroundColor: isDark ? darkSurface : 'rgba(0,0,0,0.03)'
                    })
                }}
            >
                <div ref={contentRef} className={isUser ? '' : 'markdown-compact markdown-with-copy'}>
                    {isUser ? (
                        <p className="whitespace-pre-wrap break-words text-sm">
                            {message.content}
                        </p>
                    ) : (
                        <ReactMarkdown components={markdownComponents}>
                            {message.content}
                        </ReactMarkdown>
                    )}
                    {isStreaming && (
                        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse"/>
                    )}
                </div>
            </div>

            <div className={`frsc gap-1 px-2 ${isUser ? 'justify-end' : ''}`}>
                {!isUser && (
                    <span className="text-xs text-text-tertiary">
                        {formatTime(message.created_at)}
                    </span>
                )}

                <div className="frsc gap-0.5">
                    {isUser && onEditStart && !message.id.startsWith('temp-') && (
                        <Tooltip title="Edit" arrow placement="top">
                            <IconButton
                                size="small"
                                onClick={handleEditClick}
                                sx={{
                                    padding: '3px',
                                    '&:hover': {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                                    }
                                }}
                            >
                                <EditRoundedIcon sx={{fontSize: 14, color: 'text.secondary'}}/>
                            </IconButton>
                        </Tooltip>
                    )}

                    <Tooltip title={copiedRaw ? 'Copied!' : 'Copy Markdown'} arrow placement="top">
                        <IconButton
                            size="small"
                            onClick={handleCopyRaw}
                            sx={{
                                padding: '3px',
                                '&:hover': {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                                }
                            }}
                        >
                            {copiedRaw ? (
                                <CheckRoundedIcon sx={{fontSize: 14, color: 'success.main'}}/>
                            ) : (
                                <CodeRoundedIcon sx={{fontSize: 14, color: 'text.secondary'}}/>
                            )}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={copiedText ? 'Copied!' : 'Copy Text'} arrow placement="top">
                        <IconButton
                            size="small"
                            onClick={handleCopyText}
                            sx={{
                                padding: '3px',
                                '&:hover': {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                                }
                            }}
                        >
                            {copiedText ? (
                                <CheckRoundedIcon sx={{fontSize: 14, color: 'success.main'}}/>
                            ) : (
                                <TextFieldsRoundedIcon sx={{fontSize: 14, color: 'text.secondary'}}/>
                            )}
                        </IconButton>
                    </Tooltip>
                </div>

                {isUser && (
                    <span className="text-xs text-text-tertiary">
                        {formatTime(message.created_at)}
                    </span>
                )}

                {onSiblingPrev && onSiblingNext && (
                    <BranchNavigator
                        currentIndex={siblingIndex ?? 0}
                        total={siblingsTotal ?? 0}
                        onPrev={onSiblingPrev}
                        onNext={onSiblingNext}
                        isDark={isDark}
                    />
                )}
            </div>
        </div>
    );
};

const ChatMessage = memo(ChatMessageComponent, (prevProps, nextProps) => {
    return prevProps.message.id === nextProps.message.id &&
           prevProps.message.content === nextProps.message.content &&
           prevProps.isStreaming === nextProps.isStreaming &&
           prevProps.isEditing === nextProps.isEditing &&
           prevProps.editText === nextProps.editText &&
           prevProps.siblingIndex === nextProps.siblingIndex &&
           prevProps.siblingsTotal === nextProps.siblingsTotal;
});

export default ChatMessage;
