import {useEffect, useRef} from 'react';
import type {ActionConfig} from '@shared/types';
import {actionHotkeysBridge} from '../../../services/winkyBridge';

type MutableRef<T> = {current: T};

type UseMicActionHotkeysParams = {
    activeActions: ActionConfig[];
    isMicOverlay: boolean;
    isRecording: boolean;
    isRecordingRef: MutableRef<boolean>;
    handleActionClick: (action: ActionConfig) => Promise<void> | void;
    lastDomActionHotkeyTsRef: MutableRef<number>;
    lastGlobalActionHotkeyTsRef: MutableRef<number>;
};

const HOTKEY_DEDUP_MS = 150;
const platform = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const isMac = /mac|ipod|iphone|ipad/i.test(platform);

const normalizeHotkeyToken = (token: string): string => {
    const normalized = token.trim();
    if (!normalized) {
        return '';
    }
    const lower = normalized.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
        return 'CTRL';
    }
    if (lower === 'alt' || lower === 'option') {
        return 'ALT';
    }
    if (lower === 'shift') {
        return 'SHIFT';
    }
    if (lower === 'cmd' || lower === 'command' || lower === 'meta' || lower === 'win' || lower === 'super') {
        return 'META';
    }
    if (normalized === ' ') {
        return 'SPACE';
    }
    if (lower === 'space') {
        return 'SPACE';
    }
    if (lower === 'esc' || lower === 'escape') {
        return 'ESCAPE';
    }
    if (lower === 'arrowup' || lower === 'up') {
        return 'UP';
    }
    if (lower === 'arrowdown' || lower === 'down') {
        return 'DOWN';
    }
    if (lower === 'arrowleft' || lower === 'left') {
        return 'LEFT';
    }
    if (lower === 'arrowright' || lower === 'right') {
        return 'RIGHT';
    }
    return normalized.length === 1 ? normalized.toUpperCase() : normalized.toUpperCase();
};

const normalizeHotkey = (hotkey: string): string => {
    const parts = hotkey.split('+').map((part) => normalizeHotkeyToken(part)).filter(Boolean);
    if (parts.length === 0) {
        return '';
    }
    const modifiers = new Set<string>();
    let key = '';
    parts.forEach((part) => {
        if (part === 'CTRL' || part === 'ALT' || part === 'SHIFT' || part === 'META') {
            modifiers.add(part);
            return;
        }
        key = part;
    });
    const ordered: string[] = [];
    if (modifiers.has('CTRL')) {
        ordered.push('CTRL');
    }
    if (modifiers.has('ALT')) {
        ordered.push('ALT');
    }
    if (modifiers.has('SHIFT')) {
        ordered.push('SHIFT');
    }
    if (modifiers.has('META')) {
        ordered.push('META');
    }
    if (key) {
        ordered.push(key);
    }
    return ordered.join('+');
};

const getEventHotkey = (event: KeyboardEvent): string => {
    const parts: string[] = [];
    if (event.ctrlKey) {
        parts.push('CTRL');
    }
    if (event.altKey) {
        parts.push('ALT');
    }
    if (event.shiftKey) {
        parts.push('SHIFT');
    }
    if (event.metaKey) {
        parts.push('META');
    }
    const keyToken = normalizeHotkeyToken(event.key === 'Meta' ? (isMac ? 'Cmd' : 'Win') : event.key);
    if (keyToken && keyToken !== 'CTRL' && keyToken !== 'ALT' && keyToken !== 'SHIFT' && keyToken !== 'META') {
        parts.push(keyToken);
    }
    return parts.join('+');
};

export const useMicActionHotkeys = ({
    activeActions,
    isMicOverlay,
    isRecording,
    isRecordingRef,
    handleActionClick,
    lastDomActionHotkeyTsRef,
    lastGlobalActionHotkeyTsRef
}: UseMicActionHotkeysParams): void => {
    const activeActionsRef = useRef<ActionConfig[]>(activeActions);
    const handleActionClickRef = useRef(handleActionClick);
    const hotkeysSignatureRef = useRef('');

    useEffect(() => {
        activeActionsRef.current = activeActions;
    }, [activeActions]);

    useEffect(() => {
        handleActionClickRef.current = handleActionClick;
    }, [handleActionClick]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const handler = (event: KeyboardEvent) => {
            if (!isRecordingRef.current || activeActionsRef.current.length === 0 || event.repeat) {
                return;
            }
            const normalizedEventHotkey = getEventHotkey(event);
            if (!normalizedEventHotkey) {
                return;
            }
            const action = activeActionsRef.current.find((a) => {
                if (!a.hotkey) {
                    return false;
                }
                const normalizedActionHotkey = normalizeHotkey(a.hotkey);
                return normalizedActionHotkey === normalizedEventHotkey;
            });
            if (!action) {
                return;
            }
            const now = Date.now();
            lastDomActionHotkeyTsRef.current = now;
            if (now - lastGlobalActionHotkeyTsRef.current < HOTKEY_DEDUP_MS) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            void handleActionClickRef.current(action);
        };
        window.addEventListener('keydown', handler, true);
        return () => {
            window.removeEventListener('keydown', handler, true);
        };
    }, [isMicOverlay, isRecordingRef, lastDomActionHotkeyTsRef, lastGlobalActionHotkeyTsRef]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        if (!isRecording) {
            hotkeysSignatureRef.current = '';
            void actionHotkeysBridge.clear();
            return;
        }
        const hotkeys = activeActionsRef.current
            .filter((action) => typeof action.hotkey === 'string' && action.hotkey.trim().length > 0)
            .map((action) => ({
                id: action.id,
                accelerator: action.hotkey!.trim()
            }));

        if (hotkeys.length === 0) {
            hotkeysSignatureRef.current = '';
            void actionHotkeysBridge.clear();
            return;
        }

        const signature = hotkeys
            .map((item) => `${item.id}:${normalizeHotkey(item.accelerator)}`)
            .sort()
            .join('|');
        if (signature === hotkeysSignatureRef.current) {
            return;
        }
        hotkeysSignatureRef.current = signature;
        void actionHotkeysBridge.register(hotkeys);
    }, [activeActions, isMicOverlay, isRecording]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        void actionHotkeysBridge.setRecordingActive(isRecording);
        return () => {
            void actionHotkeysBridge.setRecordingActive(false);
        };
    }, [isMicOverlay, isRecording]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const handler = (payload: {actionId?: string}) => {
            if (!payload?.actionId || !isRecordingRef.current) {
                return;
            }
            const action = activeActionsRef.current.find((item) => item.id === payload.actionId);
            if (!action) {
                return;
            }
            const now = Date.now();
            if (now - lastDomActionHotkeyTsRef.current < HOTKEY_DEDUP_MS) {
                return;
            }
            lastGlobalActionHotkeyTsRef.current = now;
            void handleActionClickRef.current(action);
        };
        const unsubscribe = window.winky?.on?.('hotkey:action-triggered', handler as any);
        return () => {
            unsubscribe?.();
        };
    }, [isMicOverlay, isRecordingRef, lastDomActionHotkeyTsRef, lastGlobalActionHotkeyTsRef]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        return () => {
            hotkeysSignatureRef.current = '';
            void actionHotkeysBridge.clear();
        };
    }, [isMicOverlay]);
};
