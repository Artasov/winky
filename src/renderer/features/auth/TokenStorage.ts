import type {AuthTokens} from '@shared/types';

const AUTH_STORAGE_KEY = 'winky.auth.tokens';

// Старые версии сохраняли токены в localStorage. Новые записи идут только в
// native config; этот адаптер нужен для одноразовой миграции существующих сессий.
export const TokenStorage = {
    read(): AuthTokens | null {
        if (typeof window === 'undefined') return null;
        try {
            const raw = window.localStorage?.getItem(AUTH_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<AuthTokens>;
            const access = parsed.access || parsed.accessToken || '';
            const refresh = parsed.refresh || parsed.refreshToken || null;
            if (!access && !refresh) return null;
            return {access, refresh};
        } catch (error) {
            console.warn('[auth] Legacy token migration failed', error);
            return null;
        }
    },
    clear(): void {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage?.removeItem(AUTH_STORAGE_KEY);
        } catch (error) {
            console.warn('[auth] Legacy token cleanup failed', error);
        }
    }
};
