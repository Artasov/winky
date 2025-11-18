import {createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {AuthClient, AuthError} from '../services/authClient';
import type {AuthDeepLinkPayload, AuthProvider as OAuthProviderType, User} from '@shared/types';

type AuthStatus =
    | 'initializing'
    | 'checking'
    | 'unauthenticated'
    | 'signing-in'
    | 'oauth'
    | 'authenticated';

type AuthContextValue = {
    status: AuthStatus;
    user: User | null;
    error: string | null;
    isAuthenticated: boolean;
    signIn: (email: string, password: string) => Promise<User>;
    startOAuth: (provider: OAuthProviderType) => Promise<void>;
    signOut: () => void;
    reloadUser: () => Promise<User | null>;
    clearError: () => void;
    isBusy: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const authClient = new AuthClient();

type AuthProviderProps = {
    children: ReactNode;
};

function normalizeAuthError(error: unknown): AuthError {
    if (error instanceof AuthError) return error;
    if (error instanceof Error) return new AuthError(error.message);
    return new AuthError(String(error ?? 'Unknown error'));
}

export function AuthProvider({children}: AuthProviderProps) {
    const [status, setStatus] = useState<AuthStatus>('initializing');
    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            try {
                const tokens = authClient.getTokens();
                if (!tokens?.access) {
                    setStatus('unauthenticated');
                    setUser(null);
                    return;
                }

                setStatus('checking');
                const profile = await authClient.getCurrentUser(true);
                if (cancelled) return;
                setUser(profile);
                setStatus('authenticated');
                setError(null);
            } catch (err) {
                if (cancelled) return;
                const normalized = normalizeAuthError(err);
                console.warn('[auth] Failed to restore session', {
                    error: normalized.message,
                    status: normalized.status
                });
                authClient.clearTokens();
                setUser(null);
                setStatus('unauthenticated');
                setError(null);
            }
        };

        bootstrap().catch((err) => {
            const normalized = normalizeAuthError(err);
            console.error('[auth] Session bootstrap failed', {error: normalized.message, status: normalized.status});
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!window.winky?.auth) return;
        let cancelled = false;

        const handleOAuthPayload = (payload: AuthDeepLinkPayload) => {
            if (cancelled || !payload) return;
            if (payload.kind === 'success') {
                console.log('[auth] OAuth payload received', {provider: payload.provider});
                try {
                    authClient.storeTokens({
                        access: payload.tokens.access,
                        refresh: payload.tokens.refresh ?? null,
                    });
                } catch (error) {
                    const normalized = normalizeAuthError(error);
                    console.error('[auth] Failed to store OAuth tokens', {error: normalized.message});
                    authClient.clearTokens();
                    setStatus('unauthenticated');
                    setUser(null);
                    setError(normalized.message);
                    return;
                }

                setStatus('checking');
                setError(null);

                // СНАЧАЛА сохраняем токены в config, чтобы App.tsx мог их увидеть
                console.log('[auth] Saving OAuth tokens to config...', {
                    hasAccess: !!payload.tokens.access,
                    hasRefresh: !!payload.tokens.refresh
                });
                
                const saveTokensPromise = window.winky?.config?.setAuth ? window.winky.config.setAuth({
                    access: payload.tokens.access,
                    refresh: payload.tokens.refresh ?? null,
                    accessToken: payload.tokens.access,
                    refreshToken: payload.tokens.refresh ?? ''
                }).then((updatedConfig) => {
                    console.log('[auth] Tokens saved to config successfully', {
                        hasAccess: !!(updatedConfig.auth.access || updatedConfig.auth.accessToken),
                        setupCompleted: updatedConfig.setupCompleted
                    });
                    return updatedConfig;
                }) : Promise.resolve(null);

                // Ждем сохранения токенов в config перед получением пользователя
                saveTokensPromise
                    .then(async (savedConfig) => {
                        if (cancelled) return;
                        
                        console.log('[auth] OAuth tokens saved to config, fetching user profile...');
                        // Теперь получаем профиль пользователя
                        const profile = await authClient.getCurrentUser(true);
                        if (cancelled) return;

                        console.log('[auth] User profile fetched successfully', {userId: profile.id, email: profile.email});
                        
                        // Устанавливаем пользователя и статус
                        setUser(profile);
                        setStatus('authenticated');
                        setError(null);

                        // НЕ навигируем здесь - пусть App.tsx сам обработает навигацию через useNavigationSync
                        // когда увидит что isAuthenticated === true и токены есть в config
                        console.log('[auth] User authenticated, waiting for App.tsx to handle navigation...');
                    })
                    .catch((err: unknown) => {
                        if (cancelled) return;
                        const normalized = normalizeAuthError(err);
                        console.error('[auth] OAuth flow failed', {error: normalized.message, step: 'save_tokens_or_fetch_user'});
                        authClient.clearTokens();
                        setUser(null);
                        setStatus('unauthenticated');
                        setError(normalized.message);
                    });
            } else {
                console.warn('[auth] OAuth flow returned error', {provider: payload.provider, error: payload.error});
                authClient.clearTokens();
                setUser(null);
                setStatus('unauthenticated');
                setError(payload.error || 'OAuth authorization failed');
            }
        };

        const unsubscribe = window.winky.auth.onOAuthPayload(handleOAuthPayload);
        window.winky.auth
            .consumePendingOAuthPayloads()
            .then((payloads) => {
                if (Array.isArray(payloads)) {
                    payloads.forEach((payload) => handleOAuthPayload(payload));
                }
            })
            .catch((err) => {
                console.warn('[auth] Failed to consume pending OAuth payloads', err);
            });

        return () => {
            cancelled = true;
            try {
                unsubscribe?.();
            } catch {
            }
        };
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        setStatus('signing-in');
        setError(null);
        try {
            const profile = await authClient.login(email, password);

            // Синхронизируем токены с config
            const tokens = authClient.getTokens();
            if (tokens && window.winky?.config?.setAuth) {
                await window.winky.config.setAuth({
                    access: tokens.access,
                    refresh: tokens.refresh ?? null,
                    accessToken: tokens.access,
                    refreshToken: tokens.refresh ?? ''
                }).catch((err) => {
                    console.warn('[auth] Failed to save tokens to config', err);
                });
            }

            setUser(profile);
            setStatus('authenticated');
            return profile;
        } catch (err) {
            const normalized = normalizeAuthError(err);
            setStatus('unauthenticated');
            setUser(null);
            setError(normalized.message);
            console.error('[auth] Sign-in failed', {error: normalized.message, status: normalized.status});
            throw normalized;
        }
    }, []);

    const startOAuth = useCallback(async (provider: OAuthProviderType) => {
        setError(null);
        setStatus('oauth');
        try {
            if (!window.winky?.auth) {
                throw new AuthError('OAuth bridge unavailable');
            }
            await window.winky.auth.startOAuth(provider);
        } catch (err) {
            const normalized = normalizeAuthError(err);
            console.error('[auth] Failed to initiate OAuth', {provider, error: normalized.message});
            setStatus('unauthenticated');
            setError(normalized.message);
            throw normalized;
        }
    }, []);

    const signOut = useCallback(() => {
        authClient.clearTokens();

        // Очищаем токены в config
        if (window.winky?.config?.setAuth) {
            window.winky.config.setAuth({
                access: '',
                refresh: null,
                accessToken: '',
                refreshToken: ''
            }).catch((err) => {
                console.warn('[auth] Failed to clear tokens in config', err);
            });
        }

        setUser(null);
        setStatus('unauthenticated');
        setError(null);
        console.log('[auth] User signed out');
    }, []);

    const reloadUser = useCallback(async () => {
        console.log('[auth] reloadUser called');
        if (!authClient.hasTokens()) {
            console.log('[auth] No tokens found in authClient, clearing user');
            authClient.clearTokens();
            setUser(null);
            setStatus('unauthenticated');
            return null;
        }

        console.log('[auth] Tokens found, fetching user profile...');
        setStatus('checking');
        try {
            const profile = await authClient.getCurrentUser(true);
            console.log('[auth] User profile reloaded successfully', {userId: profile.id, email: profile.email});
            setUser(profile);
            setStatus('authenticated');
            setError(null);
            return profile;
        } catch (err) {
            const normalized = normalizeAuthError(err);
            console.warn('[auth] Failed to reload user', {error: normalized.message, status: normalized.status});
            authClient.clearTokens();
            setUser(null);
            setStatus('unauthenticated');
            setError(normalized.message);
            return null;
        }
    }, []);

    const clearError = useCallback(() => setError(null), []);

    const value = useMemo<AuthContextValue>(() => ({
        status,
        user,
        error,
        isAuthenticated: status === 'authenticated',
        signIn,
        startOAuth,
        signOut,
        reloadUser,
        clearError,
        isBusy:
            status === 'initializing' ||
            status === 'checking' ||
            status === 'signing-in',
    }), [status, user, error, signIn, startOAuth, signOut, reloadUser, clearError]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

