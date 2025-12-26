import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import {AuthClient, AuthError} from '../services/authClient';
import {authBridge as appAuthBridge, configBridge} from '../services/winkyBridge';
import type {AuthDeepLinkPayload, AuthProvider as OAuthProviderType, User} from '@shared/types';
import {useWindowIdentity} from '../app/hooks/useWindowIdentity';
import {onUnauthorized} from '@shared/api';

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

const AUTH_CHANNEL_NAME = 'winky-auth';
const USER_CACHE_KEY = 'winky.cachedUser';

type AuthBroadcastMessage = {
    type: 'user';
    payload: User | null;
};

const readCachedUser = (): User | null => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(USER_CACHE_KEY);
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as User;
    } catch (error) {
        console.warn('[auth] Failed to read cached user', error);
        return null;
    }
};

const persistCachedUser = (user: User | null): void => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }
    try {
        if (!user) {
            window.localStorage.removeItem(USER_CACHE_KEY);
        } else {
            window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
        }
    } catch (error) {
        console.warn('[auth] Failed to persist cached user', error);
    }
};

type AuthProviderProps = {
    children: ReactNode;
};

function normalizeAuthError(error: unknown): AuthError {
    if (error instanceof AuthError) return error;
    if (error instanceof Error) return new AuthError(error.message);
    return new AuthError(String(error ?? 'Unknown error'));
}

export function AuthProvider({children}: AuthProviderProps) {
    const windowIdentity = useWindowIdentity();
    const isPrimaryWindow = !windowIdentity.isAuxWindow;
    const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
    const [status, setStatus] = useState<AuthStatus>('initializing');
    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    const ensureBroadcastChannel = useCallback((): BroadcastChannel | null => {
        if (typeof BroadcastChannel === 'undefined') {
            return null;
        }
        if (!broadcastChannelRef.current) {
            broadcastChannelRef.current = new BroadcastChannel(AUTH_CHANNEL_NAME);
        }
        return broadcastChannelRef.current;
    }, []);

    const broadcastUser = useCallback((nextUser: User | null) => {
        persistCachedUser(nextUser);
        const channel = ensureBroadcastChannel();
        if (!channel) {
            return;
        }
        try {
            channel.postMessage({type: 'user', payload: nextUser} satisfies AuthBroadcastMessage);
        } catch (err) {
            console.warn('[auth] Failed to broadcast user update', err);
        }
    }, [ensureBroadcastChannel]);

    useEffect(() => {
        const channel = ensureBroadcastChannel();
        if (!channel) {
            return;
        }
        const handleMessage = (event: MessageEvent<AuthBroadcastMessage>) => {
            const message = event.data;
            if (!message || message.type !== 'user') {
                return;
            }
            const nextUser = message.payload ?? null;
            setUser(nextUser);
            setStatus(nextUser ? 'authenticated' : 'unauthenticated');
            setError(null);
            persistCachedUser(nextUser);
        };
        channel.addEventListener('message', handleMessage as EventListener);
        return () => {
            channel.removeEventListener('message', handleMessage as EventListener);
            channel.close();
            broadcastChannelRef.current = null;
        };
    }, [ensureBroadcastChannel]);

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            try {
                const tokens = authClient.getTokens();
                if (!tokens?.access) {
                    setStatus('unauthenticated');
                    setUser(null);
                    persistCachedUser(null);
                    broadcastUser(null);
                    return;
                }

                const cachedUser = readCachedUser();

                // В auxiliary окнах (mic, result) доверяем кэшу
                if (!isPrimaryWindow) {
                    if (cachedUser) {
                        setUser(cachedUser);
                        setStatus('authenticated');
                        setError(null);
                    } else {
                        // Нет кэша — ждём broadcast от главного окна
                        setStatus('checking');
                    }
                    return;
                }

                // В primary window — всегда проверяем токен на сервере, не доверяя кэшу
                // Это предотвращает загрузку экшенов и показ микрофона с невалидным токеном
                setStatus('checking');
                const profile = await authClient.getCurrentUser(true);
                if (cancelled) return;
                setUser(profile);
                setStatus('authenticated');
                setError(null);
                broadcastUser(profile);
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
                persistCachedUser(null);
                broadcastUser(null);
            }
        };

        bootstrap().catch((err) => {
            const normalized = normalizeAuthError(err);
            console.error('[auth] Session bootstrap failed', {error: normalized.message, status: normalized.status});
        });

        return () => {
            cancelled = true;
        };
    }, [isPrimaryWindow, broadcastUser]);

    useEffect(() => {
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
                    broadcastUser(null);
                    return;
                }

                setStatus('checking');
                setError(null);

                // СНАЧАЛА сохраняем токены в config, чтобы App.tsx мог их увидеть
                console.log('[auth] Saving OAuth tokens to config...', {
                    hasAccess: !!payload.tokens.access,
                    hasRefresh: !!payload.tokens.refresh
                });
                
                const saveTokensPromise = configBridge ? configBridge.setAuth({
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
                    .then(async () => {
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
                        broadcastUser(profile);

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
                        broadcastUser(null);
                    });
            } else {
                console.warn('[auth] OAuth flow returned error', {provider: payload.provider, error: payload.error});
                authClient.clearTokens();
                setUser(null);
                setStatus('unauthenticated');
                setError(payload.error || 'OAuth authorization failed');
                broadcastUser(null);
            }
        };

                const unsubscribe = appAuthBridge.onOAuthPayload(handleOAuthPayload);
        appAuthBridge
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
            if (tokens && configBridge) {
                await configBridge.setAuth({
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
            persistCachedUser(profile);
            broadcastUser(profile);
            return profile;
        } catch (err) {
            const normalized = normalizeAuthError(err);
            setStatus('unauthenticated');
            setUser(null);
            setError(normalized.message);
            console.error('[auth] Sign-in failed', {error: normalized.message, status: normalized.status});
            throw normalized;
        }
    }, [broadcastUser]);

    const startOAuth = useCallback(async (provider: OAuthProviderType) => {
        setError(null);
        setStatus('oauth');
        if (!appAuthBridge) {
            const normalized = normalizeAuthError(new AuthError('OAuth bridge unavailable'));
            console.error('[auth] Failed to initiate OAuth', {provider, error: normalized.message});
            setStatus('unauthenticated');
            setError(normalized.message);
            throw normalized;
        }
        try {
            await appAuthBridge.startOAuth(provider);
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
        if (configBridge) {
            configBridge.setAuth({
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
        persistCachedUser(null);
        broadcastUser(null);
        try {
            window.winky?.mic?.hide?.('sign-out');
        } catch {
            /* ignore */
        }
        console.log('[auth] User signed out');
    }, [broadcastUser]);

    // Подписываемся на глобальное событие 401 (Unauthorized) от API клиента
    // При получении 401 автоматически разлогиниваем пользователя
    useEffect(() => {
        const unsubscribe = onUnauthorized(() => {
            // Проверяем, авторизован ли пользователь, чтобы избежать лишних вызовов signOut
            if (status === 'unauthenticated') {
                console.log('[auth] Received 401 but already unauthenticated, ignoring');
                return;
            }
            console.warn('[auth] Received 401 Unauthorized from API, signing out...');
            signOut();
        });
        return unsubscribe;
    }, [signOut, status]);

    const reloadUser = useCallback(async () => {
        console.log('[auth] reloadUser called');
        if (!authClient.hasTokens()) {
            console.log('[auth] No tokens found in authClient, clearing user');
            authClient.clearTokens();
            setUser(null);
            setStatus('unauthenticated');
            persistCachedUser(null);
            broadcastUser(null);
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
            persistCachedUser(profile);
            broadcastUser(profile);
            return profile;
        } catch (err) {
            const normalized = normalizeAuthError(err);
            console.warn('[auth] Failed to reload user', {error: normalized.message, status: normalized.status});
            authClient.clearTokens();
            setUser(null);
            setStatus('unauthenticated');
            setError(normalized.message);
            persistCachedUser(null);
            broadcastUser(null);
            return null;
        }
    }, [broadcastUser]);

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

