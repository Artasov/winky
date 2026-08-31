import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {AppConfig} from '@shared/types';

export const configBridge = {
    get: (): Promise<AppConfig> => invoke('config_get'),
    update: (payload: Partial<AppConfig>): Promise<AppConfig> => invoke('config_update', {payload}),
    updateMic: (payload: Pick<Partial<AppConfig>, 'micWindowPosition' | 'micAnchor' | 'selectedGroupId'>): Promise<AppConfig> =>
        invoke('config_update_mic', {payload}),
    setAuth: (
        tokens: AppConfig['auth'],
        expectedAuthRevision?: number,
        expectedBackendDomain?: string | null
    ): Promise<AppConfig> => invoke('config_set_auth', {
        tokens,
        expectedAuthRevision,
        expectedBackendDomain
    }),
    reset: (): Promise<AppConfig> => invoke('config_reset'),
    path: (): Promise<string> => invoke('config_path'),
    getLogFilePath: (): Promise<string> => invoke('app_log_path'),
    openLogsFolder: (): Promise<void> => invoke('open_app_logs_folder'),
    subscribe: async (callback: () => void): Promise<() => void> =>
        listen('config:updated', () => callback())
};
