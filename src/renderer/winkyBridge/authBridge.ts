import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import type {AuthDeepLinkPayload} from '@shared/types';

const listeners = new Set<(payload: AuthDeepLinkPayload) => void>();
let unlisten: UnlistenFn | null = null;

const ensureSubscription = async () => {
    if (unlisten) {
        return;
    }
    unlisten = await listen<AuthDeepLinkPayload>('auth:deep-link', (event) => {
        listeners.forEach((listener) => listener(event.payload));
    });
};

export const authBridge = {
    startOAuth: (provider: string) => invoke('auth_start_oauth', {provider}),
    onOAuthPayload: (callback: (payload: AuthDeepLinkPayload) => void) => {
        void ensureSubscription();
        listeners.add(callback);
        return () => listeners.delete(callback);
    },
    consumePendingOAuthPayloads: (): Promise<AuthDeepLinkPayload[]> => invoke('auth_consume_pending'),
    isRunningAsAdmin: (): Promise<boolean> => invoke('auth_is_admin')
};
