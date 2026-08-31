import type {AuthTokens} from '@shared/types';
import {configBridge} from '../winkyBridge/configBridge';
import {
    AuthService,
    type AuthPersistence,
    type AuthPersistenceSnapshot
} from '../features/auth/AuthService';

const readTokens = (auth: AuthTokens): AuthTokens | null => {
    const access = auth.access || auth.accessToken || '';
    const refresh = auth.refresh || auth.refreshToken || null;
    if (!access && !refresh) return null;
    return {access, refresh};
};

const persistence: AuthPersistence = {
    async read(): Promise<AuthPersistenceSnapshot> {
        const config = await configBridge.get();
        return {
            tokens: readTokens(config.auth),
            backendDomain: config.backendDomain,
            storageRevision: config.storageRevision,
            authRevision: config.authRevision
        };
    },
    async write(
        tokens: AuthTokens | null,
        expectedAuthRevision?: number,
        expectedBackendDomain?: string | null
    ): Promise<AuthPersistenceSnapshot> {
        const access = tokens?.access || '';
        const refresh = tokens?.refresh || null;
        const config = await configBridge.setAuth({
            access,
            refresh,
            accessToken: access,
            refreshToken: refresh || ''
        }, expectedAuthRevision, expectedBackendDomain);
        return {
            tokens: readTokens(config.auth),
            backendDomain: config.backendDomain,
            storageRevision: config.storageRevision,
            authRevision: config.authRevision
        };
    }
};

export const authClient = new AuthService(persistence);

export {
    AuthError,
    AuthService as AuthClient,
    isTerminalAuthError,
    normalizeAuthError
} from '../features/auth/AuthService';
export {TokenStorage} from '../features/auth/TokenStorage';
