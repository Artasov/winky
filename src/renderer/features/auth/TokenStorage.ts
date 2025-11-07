import type {AuthTokens} from '@shared/types';

const AUTH_STORAGE_KEY = 'winky.auth.tokens';

export const TokenStorage = {
    read(): AuthTokens | null {
        if (typeof window === 'undefined') {
            return null;
        }
        try {
            const raw = window.localStorage?.getItem(AUTH_STORAGE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw) as AuthTokens;
            if (!parsed || typeof parsed.access !== 'string') {
                return null;
            }
            return {
                access: parsed.access,
                refresh: typeof parsed.refresh === 'string' ? parsed.refresh : null
            };
        } catch (error) {
            console.warn('[TokenStorage] Failed to read tokens', error);
            return null;
        }
    },
    write(tokens: AuthTokens | null): void {
        if (typeof window === 'undefined') {
            return;
        }
        try {
            if (!tokens) {
                window.localStorage?.removeItem(AUTH_STORAGE_KEY);
                return;
            }
            window.localStorage?.setItem(
                AUTH_STORAGE_KEY,
                JSON.stringify({
                    access: tokens.access,
                    refresh: tokens.refresh ?? null
                })
            );
        } catch (error) {
            console.warn('[TokenStorage] Failed to persist tokens', error);
        }
    }
};
