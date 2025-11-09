import {useCallback, useEffect, useState} from 'react';
import type {AppConfig} from '@shared/types';

const missingPreloadMessage = 'Preload-скрипт не загружен.';

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

    const ensurePreload = useCallback(() => {
        if (!window.winky) {
            setPreloadError(missingPreloadMessage);
            throw new Error(missingPreloadMessage);
        }
        return window.winky;
    }, []);

    const refreshConfig = useCallback(async () => {
        const api = ensurePreload();
        const result = await api.config.get();
        setConfigState(result);
        setPreloadError(null);
        return result;
    }, [ensurePreload]);

    const updateConfig = useCallback(async (partial: Partial<AppConfig>) => {
        const api = ensurePreload();
        const result = await api.config.update(partial);
        setConfigState(result);
        setPreloadError(null);
        return result;
    }, [ensurePreload]);

    const setConfig = useCallback((next: AppConfig) => {
        setConfigState(next);
    }, []);

    useEffect(() => {
        const subscribe = window.winky?.config?.subscribe;
        if (!subscribe) {
            return;
        }
        const unsubscribe = subscribe((nextConfig: AppConfig) => {
            setConfigState(nextConfig);
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
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
        void load();
        return () => {
            cancelled = true;
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
