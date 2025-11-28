import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import type {AppConfig} from '@shared/types';

const subscribers = new Set<(config: AppConfig) => void>();
let unlisten: UnlistenFn | null = null;

const ensureSubscription = async () => {
    if (unlisten) {
        return;
    }
    unlisten = await listen<AppConfig>('config:updated', (event) => {
        const payload = event.payload;
        subscribers.forEach((listener) => listener(payload));
    });
};

export const configBridge = {
    get: (): Promise<AppConfig> => invoke('config_get'),
    update: (payload: Partial<AppConfig>): Promise<AppConfig> => invoke('config_update', {payload}),
    setAuth: (tokens: AppConfig['auth']): Promise<AppConfig> => invoke('config_set_auth', {tokens}),
    reset: (): Promise<AppConfig> => invoke('config_reset'),
    path: (): Promise<string> => invoke('config_path'),
    subscribe: (listener: (config: AppConfig) => void) => {
        void ensureSubscription();
        subscribers.add(listener);
        return () => subscribers.delete(listener);
    }
};

export type ConfigBridge = typeof configBridge;
