import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {interactiveEnter, interactiveLeave} from '../../../utils/interactive';

const STORAGE_KEY = 'mic_context_text';
const MIN_WIDTH = 170;
const MAX_WIDTH = 460;
const FOCUSED_MIN_HEIGHT = 39;
const MAX_HEIGHT = 400;
const BORDER_WIDTH = 3;
const PADDING = '8px 12px 8px 12px';
const PADDING_X = 24;
const PADDING_Y = 18;

interface MicContextFieldProps {
    onContextChange?: (text: string) => void;
    containerRef?: React.RefObject<HTMLDivElement | null>;
}

const MicContextField: React.FC<MicContextFieldProps> = ({onContextChange, containerRef}) => {
    const [value, setValue] = useState<string>('');
    const [isFocused, setIsFocused] = useState<boolean>(false);
    const [fieldWidth, setFieldWidth] = useState<number>(MIN_WIDTH);
    const [contentHeight, setContentHeight] = useState<number>(FOCUSED_MIN_HEIGHT);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const measureRef = useRef<HTMLDivElement | null>(null);
    const pasteInFlightRef = useRef(false);
    const hasValue = Boolean(value.trim());
    const shouldWrap = fieldWidth >= MAX_WIDTH;
    const innerWidth = Math.max(1, fieldWidth - PADDING_X - BORDER_WIDTH * 2);
    const measureValue = value.endsWith('\n') ? `${value}\u200b` : (value || ' ');
    const containerHeight = Math.min(
        MAX_HEIGHT,
        Math.max(FOCUSED_MIN_HEIGHT, Math.ceil(contentHeight + PADDING_Y + BORDER_WIDTH * 2 + 1))
    ) - 2;

    // Загружаем сохраненный текст при монтировании
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                setValue(saved);
                onContextChange?.(saved);
            }
        } catch (error) {
            console.warn('[MicContextField] Failed to load saved context', error);
        }

        // Автофокус при монтировании с небольшой задержкой
        const timer = setTimeout(() => {
            textareaRef.current?.focus();
        }, 200);

        return () => clearTimeout(timer);
    }, [onContextChange]);

    // Сохраняем текст при изменении
    useEffect(() => {
        try {
            if (value.trim()) {
                localStorage.setItem(STORAGE_KEY, value);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
            onContextChange?.(value);
        } catch (error) {
            console.warn('[MicContextField] Failed to save context', error);
        }
    }, [value, onContextChange]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const api = window.winky;
        if (!api?.on) {
            return;
        }

        const handleVisibilityChange = (first?: { visible?: boolean } | unknown, second?: { visible?: boolean }) => {
            const data = (first && typeof (first as any)?.visible === 'boolean')
                ? (first as { visible?: boolean })
                : second;
            if (data?.visible === false) {
                textareaRef.current?.blur();
                setIsFocused(false);
            } else if (data?.visible === true) {
                // Автофокус при открытии окна с небольшой задержкой
                setTimeout(() => {
                    textareaRef.current?.focus();
                }, 150);
            }
        };

        api.on('mic:visibility-change', handleVisibilityChange);
        return () => {
            api.removeListener?.('mic:visibility-change', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const handleClear = () => {
            setValue('');
            if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
        };
        window.addEventListener('mic:clear-context', handleClear);
        return () => {
            window.removeEventListener('mic:clear-context', handleClear);
        };
    }, []);

    const handleFocus = useCallback(() => {
        setIsFocused(true);
    }, []);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    const handleClear = useCallback(() => {
        setValue('');
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
        textareaRef.current?.focus();
    }, []);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setValue(event.target.value);
    }, []);

    const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        pasteInFlightRef.current = true;
        const pastedText = event.clipboardData.getData('text');
        if (!pastedText) {
            return;
        }
        event.preventDefault();
        const textarea = textareaRef.current;
        const selectionStart = textarea?.selectionStart ?? value.length;
        const selectionEnd = textarea?.selectionEnd ?? value.length;
        const nextValue = `${value.slice(0, selectionStart)}${pastedText}${value.slice(selectionEnd)}`;
        const nextCaret = selectionStart + pastedText.length;
        setValue(`${nextValue} `);
        if (typeof window === 'undefined') {
            setValue(nextValue);
            return;
        }
        window.requestAnimationFrame(() => {
            pasteInFlightRef.current = true;
            setValue(nextValue);
            window.requestAnimationFrame(() => {
                const current = textareaRef.current;
                if (!current) {
                    return;
                }
                current.focus();
                current.setSelectionRange(nextCaret, nextCaret);
            });
        });
    }, [value]);

    // Автоматическое изменение высоты без лишних перерендеров
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        const scrollContainer = scrollContainerRef.current;
        const measure = measureRef.current;
        if (!textarea || !scrollContainer) {
            return;
        }

        // Сбрасываем высоту для корректного расчета
        const recalcHeight = () => {
            textarea.style.height = '0px';
            const heightSource = measure ?? textarea;
            const nextHeight = Math.max(1, Math.ceil(heightSource.scrollHeight));
            textarea.style.height = `${nextHeight}px`;
            setContentHeight((prev) => (Math.abs(prev - nextHeight) >= 1 ? nextHeight : prev));
            const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
            if (scrollContainer.scrollTop > maxScrollTop) {
                scrollContainer.scrollTop = maxScrollTop;
            }
        };

        recalcHeight();

        if (pasteInFlightRef.current && typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
                recalcHeight();
                scrollContainer.scrollTop = 0;
                pasteInFlightRef.current = false;
            });
        }
    }, [value, isFocused, fieldWidth]);

    useLayoutEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const textarea = textareaRef.current;
        if (!textarea) {
            return;
        }
        if (!value) {
            if (fieldWidth !== MIN_WIDTH) {
                setFieldWidth(MIN_WIDTH);
            }
            return;
        }
        const style = window.getComputedStyle(textarea);
        const canvas = measureCanvasRef.current || document.createElement('canvas');
        measureCanvasRef.current = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        const font = style.font
            || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.font = font;
        const lines = value.split('\n');
        let maxLineWidth = 0;
        for (const line of lines) {
            const metrics = ctx.measureText(line || ' ');
            if (metrics.width > maxLineWidth) {
                maxLineWidth = metrics.width;
            }
        }
        const nextWidth = Math.min(
            MAX_WIDTH,
            Math.max(MIN_WIDTH, Math.ceil(maxLineWidth + PADDING_X + BORDER_WIDTH * 2))
        );
        if (Math.abs(nextWidth - fieldWidth) >= 1) {
            setFieldWidth(nextWidth);
        }
    }, [value, fieldWidth]);

    const handleContainerClick = useCallback(() => {
        textareaRef.current?.focus();
    }, []);

    return (
        <div
            ref={containerRef}
            className="pointer-events-auto"
            style={{
                width: `${fieldWidth}px`,
                maxWidth: 'calc(100vw - 64px)',
                position: 'relative',
                transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'width',
            }}
        >
            {hasValue ? (
                <button
                    type="button"
                    aria-label="Clear context"
                    className="app-region-no-drag"
                    onClick={handleClear}
                    onMouseEnter={() => interactiveEnter()}
                    onMouseLeave={() => interactiveLeave()}
                    style={{
                        position: 'absolute',
                        top: '-18px',
                        right: '10px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'rgba(225, 29, 72, 0.95)',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        cursor: 'pointer',
                        padding: 0
                    }}
                >
                    Clear
                </button>
            ) : null}
            <div
                ref={scrollContainerRef}
                className="mic-context-scrollbar app-region-no-drag"
                onClick={handleContainerClick}
                onMouseEnter={() => interactiveEnter()}
                onMouseLeave={() => interactiveLeave()}
                style={{
                    minHeight: `${FOCUSED_MIN_HEIGHT}px`,
                    maxHeight: `${MAX_HEIGHT}px`,
                    height: `${containerHeight}px`,
                    transition: 'padding 0.2s ease, border-color 0.25s ease, box-shadow 0.25s ease, background-color 0.25s ease',
                    position: 'relative',
                    overflowX: 'hidden',
                    overflowY: 'auto',
                    padding: PADDING,
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    border: `${BORDER_WIDTH}px solid rgba(225, 29, 72, 0.9)`,
                    borderRadius: '12px',
                    outline: 'none',
                    boxShadow: '0 0 16px rgba(225, 29, 72, 0.5), 0 0 24px rgba(225, 29, 72, 0.3)',
                    cursor: 'text',
                    pointerEvents: 'auto',
                }}
            >
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={value}
                    onChange={handleChange}
                    onPaste={handlePaste}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder={hasValue ? '' : 'Add context...'}
                    wrap={shouldWrap ? 'soft' : 'off'}
                    style={{
                        width: '100%',
                        fontSize: '15px',
                        lineHeight: '1.2',
                        minHeight: 0,
                        height: `${contentHeight}px`,
                        resize: 'none',
                        border: 'none',
                        outline: 'none',
                        backgroundColor: 'transparent',
                        padding: 0,
                        margin: 0,
                        whiteSpace: shouldWrap ? 'pre-wrap' : 'pre',
                        overflow: 'hidden',
                        color: 'rgba(255, 255, 255, 0.9)',
                        caretColor: 'rgba(255, 255, 255, 0.95)',
                        cursor: 'text',
                        pointerEvents: 'auto',
                        display: 'block',
                    }}
                />
                <div
                    ref={measureRef}
                    aria-hidden
                    style={{
                        position: 'absolute',
                        visibility: 'hidden',
                        pointerEvents: 'none',
                        zIndex: -1,
                        top: 0,
                        left: 0,
                        width: `${innerWidth}px`,
                        fontSize: '15px',
                        lineHeight: '1.2',
                        padding: 0,
                        margin: 0,
                        border: 0,
                        whiteSpace: shouldWrap ? 'pre-wrap' : 'pre',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {measureValue}
                </div>
            </div>
        </div>
    );
};

export default MicContextField;
