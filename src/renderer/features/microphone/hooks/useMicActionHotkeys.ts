import {useEffect} from 'react';
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

export const useMicActionHotkeys = ({
    activeActions,
    isMicOverlay,
    isRecording,
    isRecordingRef,
    handleActionClick,
    lastDomActionHotkeyTsRef,
    lastGlobalActionHotkeyTsRef
}: UseMicActionHotkeysParams): void => {
    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const handler = (event: KeyboardEvent) => {
            if (!isRecordingRef.current || activeActions.length === 0 || event.repeat) {
                return;
            }
            const action = activeActions.find((a) => {
                if (!a.hotkey) {
                    return false;
                }
                const normalizedActionHotkey = a.hotkey.trim().replace(/\s+/g, '');
                const parts: string[] = [];
                if (event.ctrlKey || event.metaKey) {
                    parts.push('Ctrl');
                }
                if (event.altKey) {
                    parts.push('Alt');
                }
                if (event.shiftKey) {
                    parts.push('Shift');
                }
                if (event.key) {
                    parts.push(event.key.toUpperCase());
                }
                const normalizedEventHotkey = parts.join('');
                return normalizedActionHotkey.toLowerCase() === normalizedEventHotkey.toLowerCase();
            });
            if (!action) {
                return;
            }
            const now = Date.now();
            lastDomActionHotkeyTsRef.current = now;
            if (now - lastGlobalActionHotkeyTsRef.current < 150) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            void handleActionClick(action);
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [activeActions, handleActionClick, isMicOverlay, isRecording, isRecordingRef, lastDomActionHotkeyTsRef, lastGlobalActionHotkeyTsRef]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        if (!isRecording) {
            void actionHotkeysBridge.clear();
            return;
        }
        const hotkeys = activeActions
            .filter((action) => typeof action.hotkey === 'string' && action.hotkey.trim().length > 0)
            .map((action) => ({
                id: action.id,
                accelerator: action.hotkey!.trim()
            }));

        if (hotkeys.length === 0) {
            void actionHotkeysBridge.clear();
            return;
        }

        void actionHotkeysBridge.register(hotkeys);

        return () => {
            void actionHotkeysBridge.clear();
        };
    }, [activeActions, isMicOverlay, isRecording]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        if (!isRecordingRef.current) {
            return;
        }
        const handler = (payload: {actionId?: string}) => {
            if (!payload?.actionId || !isRecordingRef.current) {
                return;
            }
            const action = activeActions.find((item) => item.id === payload.actionId);
            if (!action) {
                return;
            }
            const now = Date.now();
            if (now - lastDomActionHotkeyTsRef.current < 150) {
                return;
            }
            lastGlobalActionHotkeyTsRef.current = now;
            void handleActionClick(action);
        };
        const unsubscribe = window.winky?.on?.('hotkey:action-triggered', handler as any);
        return () => {
            unsubscribe?.();
        };
    }, [activeActions, handleActionClick, isMicOverlay, isRecording, lastDomActionHotkeyTsRef, lastGlobalActionHotkeyTsRef]);
};
