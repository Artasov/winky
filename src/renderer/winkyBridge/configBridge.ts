import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {AppConfig} from '@shared/types';

export const configBridge = {
    get: (): Promise<AppConfig> => invoke('config_get'),
    update: (payload: Partial<AppConfig>): Promise<AppConfig> => invoke('config_update', {payload}),
    setAuth: (tokens: AppConfig['auth']): Promise<AppConfig> => invoke('config_set_auth', {tokens}),
    reset: (): Promise<AppConfig> => invoke('config_reset'),
    path: (): Promise<string> => invoke('config_path'),
    getLogFilePath: (): Promise<string> => invoke('get_log_file_path'),
    subscribe: (callback: (config: AppConfig) => void): (() => void) => {
        let stopped = false;
        const unlistenPromise = listen<AppConfig>('config:updated', (event) => {
            if (stopped) {
                return;
            }
            callback(event.payload);
        }).catch((error) => {
            console.warn('[configBridge] Failed to subscribe to config updates:', error);
            return null;
        });

        return () => {
            stopped = true;
            unlistenPromise
                .then((unlisten) => {
                    if (typeof unlisten === 'function') {
                        unlisten();
                    }
                })
                .catch(() => {
                    /* ignore */
                });
        };
    }
};
