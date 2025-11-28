import {useCallback, useEffect, useRef, useState} from 'react';
import type {FastWhisperStatus} from '@shared/types';
import {localSpeechBridge} from '../services/winkyBridge';

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
    refresh: (checkHealth?: boolean) => Promise<FastWhisperStatus | null>;
    setStatus: (next: FastWhisperStatus | null) => void;
};

const hasDocument = typeof document !== 'undefined';
const hasWindow = typeof window !== 'undefined';

export const useLocalSpeechStatus = ({
    skip = false,
    pollIntervalMs = 15000,
    checkHealthOnMount = false,
    onStatus,
    onError
}: UseLocalSpeechStatusOptions = {}): UseLocalSpeechStatusResult => {
    const [status, setStatus] = useState<FastWhisperStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const mountedRef = useRef(true);
    const onStatusRef = useRef<((status: FastWhisperStatus) => void) | undefined>(onStatus);
    const onErrorRef = useRef<((message: string) => void) | undefined>(onError);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        onStatusRef.current = onStatus;
    }, [onStatus]);

    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);

    const fetchStatus = useCallback(
        async (checkHealth: boolean = false): Promise<FastWhisperStatus | null> => {
            if (skip || !mountedRef.current) {
                return null;
            }
            if (hasDocument && document.hidden) {
                return null;
            }
            setLoading(true);
            try {
                const nextStatus = checkHealth
                    ? await localSpeechBridge.checkHealth()
                    : await localSpeechBridge.getStatus();
                if (!mountedRef.current) {
                    return nextStatus ?? null;
                }
                if (nextStatus) {
                    setStatus(nextStatus);
                    onStatusRef.current?.(nextStatus);
                    setError(null);
                }
                return nextStatus ?? null;
            } catch (err: any) {
                if (!mountedRef.current) {
                    return null;
                }
                const message = err?.message || 'Failed to request local server status.';
                setError(message);
                onErrorRef.current?.(message);
                return null;
            } finally {
                if (mountedRef.current) {
                    setLoading(false);
                }
            }
        },
        [skip]
    );

    useEffect(() => {
        if (skip) {
            setStatus(null);
            return undefined;
        }

        void fetchStatus(checkHealthOnMount);

        const handleFocus = () => {
            void fetchStatus();
        };

        const handleVisibilityChange = () => {
            if (!hasDocument || document.hidden) {
                return;
            }
            void fetchStatus();
        };

        if (hasWindow) {
            window.addEventListener('focus', handleFocus);
        }
        if (hasDocument) {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        const pollTimer =
            pollIntervalMs > 0 && hasWindow
                ? window.setInterval(() => {
                    if (!hasDocument || document.hidden) {
                        return;
                    }
                    void fetchStatus();
                }, pollIntervalMs)
                : null;

        const unsubscribe = hasWindow
            ? localSpeechBridge.onStatus((nextStatus) => {
                if (!mountedRef.current) {
                    return;
                }
                setStatus(nextStatus);
                onStatusRef.current?.(nextStatus);
                setError(null);
            })
            : undefined;

        return () => {
            if (hasWindow) {
                window.removeEventListener('focus', handleFocus);
            }
            if (hasDocument) {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
            if (hasWindow && pollTimer !== null) {
                window.clearInterval(pollTimer);
            }
            unsubscribe?.();
        };
    }, [skip, fetchStatus, pollIntervalMs, checkHealthOnMount]);

    return {
        status,
        error,
        loading,
        refresh: fetchStatus,
        setStatus
    };
};
