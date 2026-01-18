import React, {useCallback, useEffect, useRef, useState} from 'react';
import {interactiveEnter, interactiveLeave} from '../../../utils/interactive';

const STORAGE_KEY = 'mic_context_text';
const MIN_WIDTH = 170;
const MAX_WIDTH = 460; // Шире, чтобы было больше места
const FOCUSED_MIN_HEIGHT = 37; // Компактнее по высоте
const EXPANDED_WIDTH = MAX_WIDTH;

interface MicContextFieldProps {
    onContextChange?: (text: string) => void;
    containerRef?: React.RefObject<HTMLDivElement | null>;
}

const MicContextField: React.FC<MicContextFieldProps> = ({onContextChange, containerRef}) => {
    const [value, setValue] = useState<string>('');
    const [isFocused, setIsFocused] = useState<boolean>(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const hasValue = Boolean(value.trim());
    const isExpanded = isFocused || hasValue;
    const padding = '8px 12px 6px 12px';

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

        const handleVisibilityChange = (first?: {visible?: boolean} | unknown, second?: {visible?: boolean}) => {
            const data = (first && typeof (first as any)?.visible === 'boolean')
                ? (first as {visible?: boolean})
                : second;
            if (data?.visible === false) {
                textareaRef.current?.blur();
                setIsFocused(false);
            }
        };

        api.on('mic:visibility-change', handleVisibilityChange);
        return () => {
            api.removeListener?.('mic:visibility-change', handleVisibilityChange);
        };
    }, []);

    const handleFocus = useCallback(() => {
        setIsFocused(true);
        interactiveEnter();
    }, []);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
        interactiveLeave();
    }, []);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setValue(event.target.value);
    }, []);

    // Автоматическое изменение высоты без лишних перерендеров
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
            return;
        }

        // Сбрасываем высоту для корректного расчета
        textarea.style.height = 'auto';

        const minHeight = FOCUSED_MIN_HEIGHT;
        const scrollHeight = textarea.scrollHeight;
        const newHeight = Math.max(minHeight, scrollHeight);
        textarea.style.height = `${newHeight}px`;
    }, [value, isFocused]);

    return (
        <div
            ref={containerRef}
            className="pointer-events-auto"
            style={{
                width: `${isExpanded ? EXPANDED_WIDTH : MIN_WIDTH}px`,
                maxWidth: 'calc(100vw - 64px)',
                transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'width',
            }}
        >
            <textarea
                ref={textareaRef}
                rows={1}
                value={value}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={value.trim() ? '' : 'Add context...'}
                className="mic-context-scrollbar"
                style={{
                    width: '100%',
                    fontSize: '13px',
                    lineHeight: '1.2',
                    padding,
                    minHeight: `${FOCUSED_MIN_HEIGHT}px`,
                    maxHeight: '400px',
                    height: 'auto',
                    resize: 'none',
                    transition: 'padding 0.2s ease, border-color 0.25s ease, box-shadow 0.25s ease, background-color 0.25s ease',
                    overflowY: 'auto',
                    color: 'rgba(255, 255, 255, 0.9)',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    border: '3px solid rgba(225, 29, 72, 0.9)',
                    borderRadius: '12px',
                    outline: 'none',
                    boxShadow: '0 0 16px rgba(225, 29, 72, 0.5), 0 0 24px rgba(225, 29, 72, 0.3)',
                    cursor: 'text',
                    pointerEvents: 'auto',
                }}
            />
        </div>
    );
};

export default MicContextField;
