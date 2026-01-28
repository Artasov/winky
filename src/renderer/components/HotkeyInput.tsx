import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import classNames from 'classnames';

interface HotkeyInputProps {
    value: string;
    onChange: (value: string) => void;
    onInvalid?: (reason: 'non-english' | 'modifier-only') => void;
    placeholder?: string;
}

const resolvedPlatform = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const isMac = /mac|ipod|iphone|ipad/i.test(resolvedPlatform);

const MODIFIERS = [
    {key: 'Control', prop: 'ctrlKey' as const, label: 'Ctrl'},
    {key: 'Shift', prop: 'shiftKey' as const, label: 'Shift'},
    {key: 'Alt', prop: 'altKey' as const, label: 'Alt'},
    {key: 'Meta', prop: 'metaKey' as const, label: isMac ? 'Cmd' : 'Win'}
] as const;

const modifierKeySet = new Set<string>(MODIFIERS.map((item) => item.key));

const keyDisplayLabel: Record<string, string> = {
    ' ': 'Space',
    Space: 'Space',
    Escape: 'Escape',
    Esc: 'Escape',
    Enter: 'Enter',
    Return: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert'
};

const asciiKeyRegex = /^[A-Za-z0-9]$/;

const normalizeKey = (key: string): { key: string } | { invalid: 'non-english' } | null => {
    if (key.length === 1) {
        if (!asciiKeyRegex.test(key)) {
            return {invalid: 'non-english'};
        }
        return {key: key.toUpperCase()};
    }
    if (keyDisplayLabel[key]) {
        return {key: keyDisplayLabel[key]};
    }
    if (/^F\d{1,2}$/i.test(key)) {
        return {key: key.toUpperCase()};
    }
    return null;
};

const HotkeyInput: React.FC<HotkeyInputProps> = ({value, onChange, onInvalid, placeholder = 'Press shortcut'}) => {
    const [displayValue, setDisplayValue] = useState<string>(value);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setDisplayValue(value);
    }, [value]);

    const buildAccelerator = useCallback((event: React.KeyboardEvent<HTMLDivElement>): {
        accelerator: string | null;
        invalid?: 'non-english' | 'modifier-only'
    } => {
        const parts: string[] = [];

        MODIFIERS.forEach(({prop, label}) => {
            if (event[prop]) {
                parts.push(label);
            }
        });

        if (modifierKeySet.has(event.key)) {
            return {accelerator: null};
        }

        const normalizedResult = normalizeKey(event.key);
        if (!normalizedResult) {
            return {accelerator: null, invalid: parts.length > 0 ? 'modifier-only' : undefined};
        }
        if ('invalid' in normalizedResult) {
            return {accelerator: null, invalid: normalizedResult.invalid};
        }

        parts.push(normalizedResult.key);
        return {accelerator: parts.join('+')};
    }, []);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (event.key === 'Escape') {
            setDisplayValue('');
            onChange('');
            return;
        }

        const {accelerator, invalid} = buildAccelerator(event);
        if (accelerator) {
            setDisplayValue(accelerator);
            onChange(accelerator);
        } else if (invalid && onInvalid) {
            onInvalid(invalid);
        }
    }, [buildAccelerator, onChange, onInvalid]);

    const handleClear = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        setDisplayValue('');
        onChange('');
        containerRef.current?.focus();
    }, [onChange]);

    const renderedLabel = useMemo(() => (displayValue ? displayValue : placeholder), [displayValue, placeholder]);

    return (
        <div className="flex items-center gap-2">
            <div
                ref={containerRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className={classNames(
                    'flex-1 rounded-md border px-3 py-2 text-sm',
                    'outline-none focus:ring-2 focus:ring-primary-light focus:border-primary',
                    'transition-colors duration-150',
                    displayValue ? 'cursor-pointer text-text-primary border-primary-200 bg-bg-elevated' : 'cursor-pointer text-text-tertiary border-primary-200 bg-bg-elevated'
                )}
                role="button"
                aria-label="Hotkey input"
                onClick={() => containerRef.current?.focus()}
            >
                {renderedLabel}
            </div>
            {displayValue && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-md border border-primary-200 bg-bg-elevated px-2 py-1 text-xs text-text-secondary hover:border-primary hover:text-primary"
                >
                    Clear
                </button>
            )}
        </div>
    );
};

export default HotkeyInput;
