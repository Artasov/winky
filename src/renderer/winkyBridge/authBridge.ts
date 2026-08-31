import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import type {AppConfig, AuthDeepLinkPayload, AuthMethodsResponse} from '@shared/types';

const listeners = new Set<(payload: AuthDeepLinkPayload) => void>();
let unlisten: UnlistenFn | null = null;
let subscriptionPromise: Promise<void> | null = null;

const stopSubscriptionIfUnused = (): void => {
    if (listeners.size > 0 || !unlisten) return;
    const stop = unlisten;
    unlisten = null;
    stop();
};

const startSubscription = async (): Promise<void> => {
    if (unlisten) return;
    if (!subscriptionPromise) {
        subscriptionPromise = listen<AuthDeepLinkPayload>('auth:deep-link', (event) => {
            listeners.forEach((listener) => listener(event.payload));
            void invoke<AuthDeepLinkPayload[]>('auth_consume_pending').catch((error) => {
                console.warn('[auth] OAuth callback queue cleanup failed', error);
            });
        }).then((stop) => {
            unlisten = stop;
        }).finally(() => {
            subscriptionPromise = null;
        });
    }
    await subscriptionPromise;
};

export const authBridge = {
    startOAuth: (provider: string) => invoke('auth_start_oauth', {provider}),
    exchangeOAuth: (
        payload: Extract<AuthDeepLinkPayload, {kind: 'code'}>
    ): Promise<AppConfig> => invoke('auth_exchange_oauth', {payload}),
    getAuthMethods: (): Promise<AuthMethodsResponse> => invoke('auth_get_methods'),
    onOAuthPayload: async (callback: (payload: AuthDeepLinkPayload) => void): Promise<() => void> => {
        listeners.add(callback);
        try {
            await startSubscription();
        } catch (error) {
            listeners.delete(callback);
            throw error;
        }
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            listeners.delete(callback);
            stopSubscriptionIfUnused();
        };
    },
    consumePendingOAuthPayloads: (): Promise<AuthDeepLinkPayload[]> => invoke('auth_consume_pending'),
    isRunningAsAdmin: (): Promise<boolean> => invoke('auth_is_admin')
};
