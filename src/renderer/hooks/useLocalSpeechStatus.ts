import {useCallback, useEffect, useMemo, useRef, useSyncExternalStore} from 'react';
import type {FastWhisperStatus} from '@shared/types';
import {
    getLocalSpeechState,
    localSpeechManager,
    normalizeLocalSpeechModelName,
    subscribeToLocalSpeechState,
    type LocalSpeechModelStatus,
    type LocalSpeechServerAction,
    type LocalSpeechState
} from '../services/localSpeechModels';

type UseLocalSpeechStatusOptions = {
    skip?: boolean;
    pollIntervalMs?: number;
    checkHealthOnMount?: boolean;
    onStatus?: (status: FastWhisperStatus) => void;
    onError?: (message: string) => void;
};

type UseLocalSpeechStatusResult = {
    status: FastWhisperStatus | null;
    error: string | null;
    loading: boolean;
    operation: LocalSpeechServerAction | null;
    transcriptionInProgress: boolean;
    refresh: (checkHealth?: boolean) => Promise<FastWhisperStatus | null>;
    setStatus: (next: FastWhisperStatus | null) => void;
};

const hasDocument = typeof document !== 'undefined';
const hasWindow = typeof window !== 'undefined';

export const useLocalSpeechState = (): LocalSpeechState =>
    useSyncExternalStore(subscribeToLocalSpeechState, getLocalSpeechState, getLocalSpeechState);

export const useLocalSpeechModelStatus = (model: string): LocalSpeechModelStatus => {
    const state = useLocalSpeechState();
    const normalized = useMemo(() => normalizeLocalSpeechModelName(model), [model]);
    return state.models[normalized] ?? {
        model: normalized,
        phase: state.serverStatus?.installed === false ? 'unavailable' : 'unknown',
        downloaded: null,
        updatedAt: 0
    };
};

export const useLocalSpeechStatus = ({
    skip = false,
    pollIntervalMs = 15_000,
    checkHealthOnMount = false,
    onStatus,
    onError
}: UseLocalSpeechStatusOptions = {}): UseLocalSpeechStatusResult => {
    const state = useLocalSpeechState();
    const onStatusRef = useRef(onStatus);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onStatusRef.current = onStatus;
    }, [onStatus]);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    const refresh = useCallback(
        async (checkHealth: boolean = false): Promise<FastWhisperStatus | null> => {
            if (skip || (hasDocument && document.hidden)) return null;
            return localSpeechManager.refreshServerStatus(checkHealth);
        },
        [skip]
    );

    useEffect(() => {
        if (skip) return;
        void refresh(checkHealthOnMount);

        const handleFocus = () => void refresh();
        const handleVisibilityChange = () => {
            if (!hasDocument || !document.hidden) void refresh();
        };

        if (hasWindow) window.addEventListener('focus', handleFocus);
        if (hasDocument) document.addEventListener('visibilitychange', handleVisibilityChange);
        const pollTimer = pollIntervalMs > 0 && hasWindow
            ? window.setInterval(() => {
                if (!hasDocument || !document.hidden) void refresh();
            }, pollIntervalMs)
            : null;

        return () => {
            if (hasWindow) window.removeEventListener('focus', handleFocus);
            if (hasDocument) document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (hasWindow && pollTimer !== null) window.clearInterval(pollTimer);
        };
    }, [skip, refresh, pollIntervalMs, checkHealthOnMount]);

    useEffect(() => {
        if (!skip && state.serverStatus) onStatusRef.current?.(state.serverStatus);
    }, [skip, state.serverStatus]);

    useEffect(() => {
        if (!skip && state.serverError) onErrorRef.current?.(state.serverError);
    }, [skip, state.serverError]);

    return {
        status: skip ? null : state.serverStatus,
        error: skip ? null : state.serverError,
        loading: !skip && state.serverLoading,
        operation: skip ? null : state.serverOperation,
        transcriptionInProgress: !skip && state.activeTranscriptions.length > 0,
        refresh,
        setStatus: localSpeechManager.setServerStatus
    };
};
