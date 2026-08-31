import {useCallback, useEffect, useRef, useState} from 'react';
import type {AppConfig} from '@shared/types';
import {setBackendDomain} from '@shared/constants';
import {triggerUnauthorized} from '@shared/api';
import {authClient} from '../../services/authClient';

const missingPreloadMessage = 'Preload script is not loaded.';

export interface ConfigController {
    config: AppConfig | null;
    loading: boolean;
    preloadError: string | null;
    refreshConfig: () => Promise<AppConfig>;
    updateConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>;
    setConfig: (next: AppConfig) => void;
}

export const useConfigController = (): ConfigController => {
    const [config, setConfigState] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [preloadError, setPreloadError] = useState<string | null>(() =>
        typeof window !== 'undefined' && window.winky ? null : missingPreloadMessage
    );

    const updateQueueRef = useRef<Promise<void>>(Promise.resolve());
    const pendingUpdatesRef = useRef(0);
    const latestUpdateRef = useRef<AppConfig | null>(null);
    const readSequenceRef = useRef(0);

    const applyConfig = useCallback((next: AppConfig) => {
        const hadAuth = authClient.hasTokens();
        setBackendDomain(next.backendDomain);
        authClient.setSession(
            next.auth,
            next.backendDomain,
            next.storageRevision,
            next.authRevision
        );
        if (hadAuth && !authClient.hasTokens()) triggerUnauthorized();
        setConfigState(next);
        setPreloadError(null);
    }, []);

    const getBridge = useCallback(() => {
        if (!window.winky) {
            setPreloadError(missingPreloadMessage);
            throw new Error(missingPreloadMessage);
        }
        return window.winky;
    }, []);

    const refreshConfig = useCallback(async () => {
        const api = getBridge();
        const sequence = ++readSequenceRef.current;
        const result = await api.config.get();
        if (sequence === readSequenceRef.current && pendingUpdatesRef.current === 0) {
            applyConfig(result);
        }
        return result;
    }, [applyConfig, getBridge]);

    const updateConfig = useCallback((partial: Partial<AppConfig>): Promise<AppConfig> => {
        pendingUpdatesRef.current += 1;
        const operation = updateQueueRef.current.then(async () => {
            const api = getBridge();
            const result = await api.config.update(partial);
            latestUpdateRef.current = result;
            return result;
        });

        updateQueueRef.current = operation.then(
            () => undefined,
            () => undefined
        );

        return operation.finally(async () => {
            pendingUpdatesRef.current = Math.max(0, pendingUpdatesRef.current - 1);
            if (pendingUpdatesRef.current > 0) return;

            try {
                await refreshConfig();
            } catch (error) {
                const latestUpdate = latestUpdateRef.current;
                if (pendingUpdatesRef.current === 0 && latestUpdate) applyConfig(latestUpdate);
                console.warn('[useConfigController] Failed to reconcile config after update', error);
            } finally {
                if (pendingUpdatesRef.current === 0) latestUpdateRef.current = null;
            }
        });
    }, [applyConfig, getBridge, refreshConfig]);

    const setConfig = useCallback((next: AppConfig) => {
        readSequenceRef.current += 1;
        applyConfig(next);
    }, [applyConfig]);

    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;

        const initialize = async () => {
            const subscribe = window.winky?.config?.subscribe;
            if (subscribe) {
                try {
                    unsubscribe = await subscribe(() => {
                        if (cancelled) return;
                        void refreshConfig().catch((error) => {
                            console.warn('[useConfigController] Failed to refresh config event', error);
                        });
                    });
                } catch (error) {
                    console.warn('[useConfigController] Failed to subscribe to config updates', error);
                }
            }

            if (cancelled) {
                unsubscribe?.();
                return;
            }
            try {
                await refreshConfig();
            } catch (error) {
                console.error('[useConfigController] Failed to load config', error);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void initialize();
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [refreshConfig]);

    return {
        config,
        loading,
        preloadError,
        refreshConfig,
        updateConfig,
        setConfig
    };
};
