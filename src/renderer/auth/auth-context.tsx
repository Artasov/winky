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
import {
    authClient,
    AuthError,
    isTerminalAuthError,
    normalizeAuthError
} from '../services/authClient';
import {authBridge as appAuthBridge} from '../services/winkyBridge';
import type {
    AuthDeepLinkPayload,
    AuthMethodsResponse,
    AuthProvider as OAuthProviderType,
    AuthTokens,
    User
} from '@shared/types';
import {useWindowIdentity} from '../app/hooks/useWindowIdentity';
import {onUnauthorized} from '@shared/api';

type AuthStatus =
    | 'initializing'
    | 'checking'
    | 'degraded'
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
    getAuthMethods: () => Promise<AuthMethodsResponse>;
    signOut: () => Promise<void>;
    reloadUser: () => Promise<User | null>;
    clearError: () => void;
    isBusy: boolean;
};

type AuthProviderProps = {
    children: ReactNode;
};

type AuthBroadcastMessage = {
    type: 'session';
    authenticated: boolean;
    user: User | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_CHANNEL_NAME = 'winky-auth';
const USER_CACHE_KEY = 'winky.cachedUser';
const OAUTH_ATTEMPT_TIMEOUT_MS = 5 * 60 * 1000;

const readCachedUser = (): User | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage?.getItem(USER_CACHE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== 'object') return null;
        const record = value as Record<string, unknown>;
        if (typeof record.id !== 'number' || typeof record.email !== 'string') return null;
        return value as User;
    } catch (error) {
        console.warn('[auth] Cached profile is unavailable', error);
        return null;
    }
};

const persistCachedUser = (user: User | null): void => {
    if (typeof window === 'undefined') return;
    try {
        if (user) window.localStorage?.setItem(USER_CACHE_KEY, JSON.stringify(user));
        else window.localStorage?.removeItem(USER_CACHE_KEY);
    } catch (error) {
        console.warn('[auth] Cached profile update failed', error);
    }
};

export function AuthProvider({children}: AuthProviderProps) {
    const windowIdentity = useWindowIdentity();
    const isPrimaryWindow = !windowIdentity.isAuxWindow;
    const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
    const reloadPromiseRef = useRef<Promise<User | null> | null>(null);
    const oauthPayloadsRef = useRef(new Set<string>());
    const oauthTimeoutRef = useRef<number | null>(null);
    const hasSessionRef = useRef(false);
    const [status, setStatus] = useState<AuthStatus>('initializing');
    const [hasSession, setHasSession] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);

    const setSessionAvailable = useCallback((available: boolean) => {
        hasSessionRef.current = available;
        setHasSession(available);
    }, []);

    const getBroadcastChannel = useCallback((): BroadcastChannel | null => {
        if (typeof BroadcastChannel === 'undefined') return null;
        if (!broadcastChannelRef.current) {
            broadcastChannelRef.current = new BroadcastChannel(AUTH_CHANNEL_NAME);
        }
        return broadcastChannelRef.current;
    }, []);

    const broadcastSession = useCallback((authenticated: boolean, nextUser: User | null) => {
        if (authenticated && nextUser) persistCachedUser(nextUser);
        if (!authenticated) persistCachedUser(null);
        try {
            getBroadcastChannel()?.postMessage({
                type: 'session',
                authenticated,
                user: nextUser
            } satisfies AuthBroadcastMessage);
        } catch (channelError) {
            console.warn('[auth] Session broadcast failed', channelError);
        }
    }, [getBroadcastChannel]);

    const setAuthenticatedUser = useCallback((profile: User) => {
        setSessionAvailable(true);
        setUser(profile);
        setStatus('authenticated');
        setError(null);
        persistCachedUser(profile);
        broadcastSession(true, profile);
    }, [broadcastSession, setSessionAvailable]);

    const setSignedOut = useCallback(() => {
        setSessionAvailable(false);
        setUser(null);
        setStatus('unauthenticated');
        setError(null);
        persistCachedUser(null);
        broadcastSession(false, null);
    }, [broadcastSession, setSessionAvailable]);

    const setDegradedSession = useCallback((sessionError: AuthError, cachedUser: User | null) => {
        setSessionAvailable(true);
        setUser(cachedUser);
        setStatus('degraded');
        setError(sessionError.message);
    }, [setSessionAvailable]);

    const applyTerminalClear = useCallback((cleared: boolean) => {
        if (cleared || !authClient.hasTokens()) {
            setSignedOut();
            return;
        }
        setDegradedSession(
            new AuthError(
                'A newer authentication session is active.',
                undefined,
                undefined,
                'auth_session_changed'
            ),
            readCachedUser()
        );
    }, [setDegradedSession, setSignedOut]);

    const clearOAuthTimeout = useCallback(() => {
        if (oauthTimeoutRef.current === null) return;
        window.clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
    }, []);

    useEffect(() => clearOAuthTimeout, [clearOAuthTimeout]);

    useEffect(() => {
        const channel = getBroadcastChannel();
        if (!channel) return;
        const handleMessage = (event: MessageEvent<AuthBroadcastMessage>) => {
            const message = event.data;
            if (!message || message.type !== 'session') return;
            setSessionAvailable(message.authenticated);
            setUser(message.user ?? null);
            setStatus(message.authenticated
                ? message.user ? 'authenticated' : 'degraded'
                : 'unauthenticated');
            setError(null);
            if (message.authenticated && message.user) persistCachedUser(message.user);
            if (!message.authenticated) persistCachedUser(null);
        };
        channel.addEventListener('message', handleMessage as EventListener);
        return () => {
            channel.removeEventListener('message', handleMessage as EventListener);
            channel.close();
            broadcastChannelRef.current = null;
        };
    }, [getBroadcastChannel, setSessionAvailable]);

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            const tokens = await authClient.loadSession();
            if (cancelled) return;
            if (!tokens) {
                if (isPrimaryWindow) {
                    setSignedOut();
                } else {
                    setSessionAvailable(false);
                    setUser(null);
                    setStatus('unauthenticated');
                    setError(null);
                }
                return;
            }

            const cachedUser = readCachedUser();
            setSessionAvailable(true);
            setUser(cachedUser);
            if (!isPrimaryWindow) {
                setStatus(cachedUser ? 'authenticated' : 'degraded');
                setError(null);
                return;
            }

            setStatus('checking');
            try {
                const profile = await authClient.getCurrentUser(true);
                if (!cancelled) setAuthenticatedUser(profile);
            } catch (bootstrapError) {
                if (cancelled) return;
                const normalized = normalizeAuthError(bootstrapError);
                console.warn('[auth] Session verification failed', {
                    status: normalized.status,
                    code: normalized.code
                });
                if (isTerminalAuthError(normalized)) {
                    const cleared = await authClient.clearTokens();
                    if (!cancelled) applyTerminalClear(cleared);
                    return;
                }
                setDegradedSession(normalized, cachedUser);
            }
        };

        void bootstrap().catch((bootstrapError) => {
            if (cancelled) return;
            const normalized = normalizeAuthError(bootstrapError);
            console.error('[auth] Session bootstrap failed', {
                status: normalized.status,
                code: normalized.code
            });
            if (authClient.hasTokens()) {
                setDegradedSession(normalized, readCachedUser());
                return;
            }
            setSessionAvailable(false);
            setUser(null);
            setStatus('unauthenticated');
            setError(normalized.message);
        });
        return () => {
            cancelled = true;
        };
    }, [
        applyTerminalClear,
        isPrimaryWindow,
        setAuthenticatedUser,
        setDegradedSession,
        setSessionAvailable,
        setSignedOut
    ]);

    const finishOAuth = useCallback(async (payload: Extract<AuthDeepLinkPayload, {kind: 'code'}>) => {
        clearOAuthTimeout();
        setStatus('checking');
        setError(null);
        try {
            const config = await appAuthBridge.exchangeOAuth(payload);
            authClient.setSession(
                config.auth,
                config.backendDomain,
                config.storageRevision,
                config.authRevision
            );
            setSessionAvailable(true);
            const profile = await authClient.getCurrentUser(true);
            setAuthenticatedUser(profile);
        } catch (oauthError) {
            const normalized = normalizeAuthError(oauthError);
            console.error('[auth] OAuth exchange failed', {
                provider: payload.provider,
                status: normalized.status,
                code: normalized.code
            });
            if (isTerminalAuthError(normalized)) {
                const cleared = await authClient.clearTokens();
                applyTerminalClear(cleared);
            } else {
                setStatus(hasSessionRef.current ? 'degraded' : 'unauthenticated');
                setError(normalized.message);
            }
        }
    }, [applyTerminalClear, clearOAuthTimeout, setAuthenticatedUser, setSessionAvailable]);

    useEffect(() => {
        if (!isPrimaryWindow) return;
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        const handleOAuthPayload = (payload: AuthDeepLinkPayload) => {
            if (cancelled) return;
            if (oauthPayloadsRef.current.has(payload.state)) return;
            oauthPayloadsRef.current.add(payload.state);
            if (payload.kind === 'code') {
                void finishOAuth(payload);
                return;
            }
            clearOAuthTimeout();
            console.warn('[auth] OAuth provider returned an error', {
                provider: payload.provider
            });
            setStatus(hasSessionRef.current ? 'degraded' : 'unauthenticated');
            setError(payload.error || 'OAuth authorization failed');
        };

        void appAuthBridge.onOAuthPayload(handleOAuthPayload)
            .then(async (stop) => {
                if (cancelled) {
                    stop();
                    return;
                }
                unsubscribe = stop;
                try {
                    const payloads = await appAuthBridge.consumePendingOAuthPayloads();
                    if (!cancelled) payloads.forEach(handleOAuthPayload);
                } catch (pendingError) {
                    if (!cancelled) {
                        console.warn('[auth] Pending OAuth result is unavailable', pendingError);
                    }
                }
            })
            .catch((subscriptionError) => {
                if (!cancelled) {
                    console.warn('[auth] OAuth callback subscription is unavailable', subscriptionError);
                }
            });

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [clearOAuthTimeout, finishOAuth, isPrimaryWindow]);

    const signIn = useCallback(async (email: string, password: string): Promise<User> => {
        setStatus('signing-in');
        setError(null);
        try {
            const profile = await authClient.login(email, password);
            setAuthenticatedUser(profile);
            return profile;
        } catch (signInError) {
            const normalized = normalizeAuthError(signInError);
            setStatus(hasSessionRef.current ? 'degraded' : 'unauthenticated');
            setError(normalized.message);
            throw normalized;
        }
    }, [setAuthenticatedUser]);

    const startOAuth = useCallback(async (provider: OAuthProviderType): Promise<void> => {
        clearOAuthTimeout();
        setStatus('oauth');
        setError(null);
        try {
            await appAuthBridge.startOAuth(provider);
            oauthTimeoutRef.current = window.setTimeout(() => {
                oauthTimeoutRef.current = null;
                setStatus(hasSessionRef.current ? 'degraded' : 'unauthenticated');
                setError('OAuth authorization timed out. Try again.');
            }, OAUTH_ATTEMPT_TIMEOUT_MS);
        } catch (startError) {
            clearOAuthTimeout();
            const normalized = normalizeAuthError(startError);
            setStatus(hasSessionRef.current ? 'degraded' : 'unauthenticated');
            setError(normalized.message);
            throw normalized;
        }
    }, [clearOAuthTimeout]);

    const getAuthMethods = useCallback(() => appAuthBridge.getAuthMethods(), []);

    const signOut = useCallback(async (): Promise<void> => {
        let cleared = false;
        try {
            cleared = await authClient.logout();
        } finally {
            applyTerminalClear(cleared);
            try {
                window.winky?.mic?.hide?.({reason: 'sign-out'});
            } catch (micError) {
                console.warn('[auth] Microphone window could not be hidden', micError);
            }
        }
    }, [applyTerminalClear]);

    const reloadUser = useCallback(async (): Promise<User | null> => {
        if (reloadPromiseRef.current) return reloadPromiseRef.current;
        reloadPromiseRef.current = (async () => {
            let tokens: AuthTokens | null;
            try {
                tokens = await authClient.loadSession();
            } catch (storageError) {
                const normalized = normalizeAuthError(storageError);
                const cachedUser = readCachedUser();
                if (authClient.hasTokens()) {
                    setDegradedSession(normalized, cachedUser);
                    return cachedUser;
                }
                setSessionAvailable(false);
                setUser(null);
                setStatus('unauthenticated');
                setError(normalized.message);
                return null;
            }
            if (!tokens) {
                setSignedOut();
                return null;
            }
            const cachedUser = readCachedUser();
            setSessionAvailable(true);
            setStatus('checking');
            try {
                const profile = await authClient.getCurrentUser(true);
                setAuthenticatedUser(profile);
                return profile;
            } catch (reloadError) {
                const normalized = normalizeAuthError(reloadError);
                console.warn('[auth] Profile refresh failed', {
                    status: normalized.status,
                    code: normalized.code
                });
                if (isTerminalAuthError(normalized)) {
                    const cleared = await authClient.clearTokens();
                    applyTerminalClear(cleared);
                    return null;
                }
                setDegradedSession(normalized, cachedUser);
                return cachedUser;
            }
        })().finally(() => {
            reloadPromiseRef.current = null;
        });
        return reloadPromiseRef.current;
    }, [applyTerminalClear, setAuthenticatedUser, setDegradedSession, setSessionAvailable]);

    useEffect(() => {
        if (!isPrimaryWindow) return;
        return onUnauthorized(() => {
            if (!hasSessionRef.current) return;
            void reloadUser();
        });
    }, [isPrimaryWindow, reloadUser]);

    const clearError = useCallback(() => setError(null), []);
    const value = useMemo<AuthContextValue>(() => ({
        status,
        user,
        error,
        isAuthenticated: hasSession && status !== 'unauthenticated',
        signIn,
        startOAuth,
        getAuthMethods,
        signOut,
        reloadUser,
        clearError,
        isBusy: status === 'initializing'
            || status === 'checking'
            || status === 'signing-in'
            || status === 'oauth'
    }), [
        status,
        user,
        error,
        hasSession,
        signIn,
        startOAuth,
        getAuthMethods,
        signOut,
        reloadUser,
        clearError
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}
