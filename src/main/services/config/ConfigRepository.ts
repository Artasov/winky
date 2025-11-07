import type {ActionConfig, AppConfig, AuthTokens, MicAnchor} from '@shared/types';
import {
    getConfig,
    getStore,
    resetConfig,
    setActions,
    setAuthTokens,
    updateConfig
} from '../../config';

type MicWindowPosition = { x: number; y: number } | undefined;

export class ConfigRepository {
    async get(): Promise<AppConfig> {
        return getConfig();
    }

    async update(partial: Partial<AppConfig>): Promise<AppConfig> {
        return updateConfig(partial);
    }

    async reset(): Promise<AppConfig> {
        return resetConfig();
    }

    async setAuthTokens(tokens: AuthTokens): Promise<AppConfig> {
        return setAuthTokens(tokens);
    }

    async setActions(actions: ActionConfig[]): Promise<ActionConfig[]> {
        return setActions(actions);
    }

    async getMicWindowPosition(): Promise<MicWindowPosition> {
        const store = await getStore();
        return store.get('micWindowPosition');
    }

    async setMicWindowPosition(position: MicWindowPosition): Promise<void> {
        const store = await getStore();
        if (!position) {
            store.set('micWindowPosition', undefined);
            return;
        }
        store.set('micWindowPosition', position);
    }

    async getMicAnchor(): Promise<MicAnchor> {
        const store = await getStore();
        return store.get('micAnchor') as MicAnchor;
    }

    async setMicAnchor(anchor: MicAnchor): Promise<void> {
        const store = await getStore();
        store.set('micAnchor', anchor);
    }
}
