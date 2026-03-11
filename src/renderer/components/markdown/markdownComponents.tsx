import React, {useCallback, useState} from 'react';
import type {Components} from 'react-markdown';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {oneDark, oneLight} from 'react-syntax-highlighter/dist/esm/styles/prism';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import {clipboardBridge} from '../../services/winkyBridge';

const markdownComponentsCache = new Map<boolean, Components>();

const CodeBlockCopyButton: React.FC<{code: string}> = ({code}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async (event: React.MouseEvent) => {
        event.stopPropagation();
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

export const getMarkdownComponents = (isDark: boolean): Components => {
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
