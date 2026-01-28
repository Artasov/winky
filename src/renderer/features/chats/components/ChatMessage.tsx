import React, {useCallback, useRef, useState, memo} from 'react';
import ReactMarkdown from 'react-markdown';
import type {Components} from 'react-markdown';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {oneDark, oneLight} from 'react-syntax-highlighter/dist/esm/styles/prism';
import {alpha, useTheme} from '@mui/material/styles';
import {IconButton, Tooltip} from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import type {WinkyChatMessage} from '@shared/types';
import {clipboardBridge} from '../../../services/winkyBridge';

// Кешированные компоненты для light и dark темы (создаются один раз)
const markdownComponentsCache = new Map<boolean, Components>();

interface ChatMessageProps {
    message: WinkyChatMessage;
    isStreaming?: boolean;
}

const formatTime = (value: string): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
};

// Компонент кнопки копирования для блоков кода
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

// Кастомный рендерер для блоков кода с кнопкой копирования и подсветкой синтаксиса
const getMarkdownComponents = (isDark: boolean): Components => {
    // Возвращаем из кеша если уже создано
    const cached = markdownComponentsCache.get(isDark);
    if (cached) return cached;

    const components: Components = {
        code: ({className, children, ...props}) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            // Inline code (no language specified and no newlines)
            const isInline = !match && !codeString.includes('\n');

            if (isInline) {
                return (
                    <code className={className} {...props}>
                        {children}
                    </code>
                );
            }

            // Code block with syntax highlighting
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
                            background: isDark ? 'rgba(0, 0, 0, 0.3)' : 'var(--color-bg-secondary)'
                        }}
                        codeTagProps={{
                            style: {
                                background: 'transparent'
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

const ChatMessageComponent: React.FC<ChatMessageProps> = ({message, isStreaming}) => {
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

    // Используем кешированные компоненты для избежания пересоздания
    const markdownComponents = getMarkdownComponents(isDark);

    return (
        <div className={`fc gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
            {/* Message bubble */}
            <div
                className={`rounded-2xl px-4 py-2 ${
                    isUser
                        ? 'bg-primary text-white'
                        : isDark
                            ? 'bg-white/10'
                            : 'bg-bg-tertiary'
                }`}
                style={{
                    maxWidth: '85%',
                    minWidth: '80px',
                    ...(!isUser && isDark ? {backgroundColor: darkSurface} : {})
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

            {/* Footer: LLM = время, иконки | User = иконки, время (справа) */}
            <div className={`frsc gap-1 px-2 ${isUser ? 'justify-end' : ''}`}>
                {/* Для LLM: время первым */}
                {!isUser && (
                    <span className="text-xs text-text-tertiary">
                        {formatTime(message.created_at)}
                    </span>
                )}

                {/* Copy buttons - всегда видны */}
                <div className="frsc gap-0.5">
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

                {/* Для User: время последним */}
                {isUser && (
                    <span className="text-xs text-text-tertiary">
                        {formatTime(message.created_at)}
                    </span>
                )}
            </div>
        </div>
    );
};

// Мемоизированный компонент - перерендерится только при изменении message или isStreaming
const ChatMessage = memo(ChatMessageComponent, (prevProps, nextProps) => {
    return prevProps.message.id === nextProps.message.id &&
           prevProps.message.content === nextProps.message.content &&
           prevProps.isStreaming === nextProps.isStreaming;
});

export default ChatMessage;
