import axios, {
    AxiosError,
    AxiosInstance,
    AxiosRequestConfig,
    InternalAxiosRequestConfig
} from 'axios';
import {
    getApiBaseUrl,
    getAuthEndpoint,
    getAuthMethodsEndpoint,
    getAuthRefreshEndpoint,
    getMeEndpoint,
    getWsBaseUrl as resolveWsBaseUrl
} from '@shared/constants';
import type {AuthMethodsResponse, AuthTokens, User} from '@shared/types';
import {TokenStorage} from './TokenStorage';

const TERMINAL_REFRESH_CODES = new Set([
    'refresh_token_expired',
    'refresh_token_invalid',
    'refresh_token_missing',
    'refresh_token_reused'
]);
const REFRESH_LOCK_NAME = 'winky-auth-refresh';
const AUTH_REQUEST_TIMEOUT_MS = 15_000;

type TokenResponsePayload = {
    access?: unknown;
    refresh?: unknown;
    user?: unknown;
    [key: string]: unknown;
};

export type AuthPersistenceSnapshot = {
    tokens: AuthTokens | null;
    backendDomain?: string | null;
    storageRevision?: number;
    authRevision?: number;
};

export type AuthPersistence = {
    read: () => Promise<AuthPersistenceSnapshot>;
    write: (
        tokens: AuthTokens | null,
        expectedAuthRevision?: number,
        expectedBackendDomain?: string | null
    ) => Promise<AuthPersistenceSnapshot>;
};

export class AuthError extends Error {
    public status?: number;
    public details?: unknown;
    public code?: string;

    constructor(message: string, status?: number, details?: unknown, code?: string) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
        this.details = details;
        this.code = code;
    }
}

const getErrorCode = (payload: unknown): string | undefined => {
    if (!payload || typeof payload !== 'object') return undefined;
    const record = payload as Record<string, unknown>;
    if (typeof record.code === 'string' && record.code.trim()) return record.code.trim();
    return getErrorCode(record.detail);
};

const extractMessage = (payload: unknown, fallback: string): string => {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload.trim() || fallback;
    if (Array.isArray(payload) && payload.length) return extractMessage(payload[0], fallback);
    if (typeof payload !== 'object') return fallback;

    const record = payload as Record<string, unknown>;
    if (record.detail) return extractMessage(record.detail, fallback);
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    if (Array.isArray(record.non_field_errors) && record.non_field_errors.length) {
        return extractMessage(record.non_field_errors[0], fallback);
    }
    const firstValue = Object.values(record).find((value) =>
        typeof value === 'string' || (Array.isArray(value) && value.length > 0)
    );
    return firstValue ? extractMessage(firstValue, fallback) : fallback;
};

export const normalizeAuthError = (error: unknown): AuthError => {
    if (error instanceof AuthError) return error;
    if ((error instanceof DOMException && error.name === 'AbortError') || axios.isCancel(error)) {
        const aborted = new AuthError('Request cancelled.', undefined, undefined, 'request_aborted');
        aborted.name = 'AbortError';
        return aborted;
    }
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const payload = error.response?.data;
        const fallback = status ? `Request failed with status ${status}` : 'Network request failed';
        return new AuthError(extractMessage(payload, fallback), status, payload, getErrorCode(payload));
    }
    if (error instanceof Error) return new AuthError(error.message);
    return new AuthError(String(error ?? 'Unknown error'));
};

export const isTerminalAuthError = (error: unknown): boolean => {
    const normalized = normalizeAuthError(error);
    return Boolean(normalized.code && TERMINAL_REFRESH_CODES.has(normalized.code));
};

const readAccess = (tokens: AuthTokens | null | undefined): string =>
    tokens?.access || tokens?.accessToken || '';

const readRefresh = (tokens: AuthTokens | null | undefined): string | null =>
    tokens?.refresh || tokens?.refreshToken || null;

const normalizeTokens = (tokens: AuthTokens | null | undefined): AuthTokens | null => {
    const access = readAccess(tokens);
    const refresh = readRefresh(tokens);
    if (!access && !refresh) return null;
    return {access, refresh};
};

const isRetriedRequest = (config: InternalAxiosRequestConfig): boolean =>
    Boolean((config as InternalAxiosRequestConfig & {winkyAuthRetried?: boolean}).winkyAuthRetried);

const markRetriedRequest = (config: InternalAxiosRequestConfig): void => {
    (config as InternalAxiosRequestConfig & {winkyAuthRetried?: boolean}).winkyAuthRetried = true;
};

export class AuthService {
    private tokens: AuthTokens | null = null;
    private backendDomain: string | null = null;
    private refreshOperation: {
        backendDomain: string | null;
        authRevision: number;
        sessionGeneration: number;
        promise: Promise<string>;
    } | null = null;
    private storageRevision = -1;
    private authRevision = -1;
    private sessionGeneration = 0;

    constructor(private readonly persistence: AuthPersistence) {}

    getTokens(): AuthTokens | null {
        return this.tokens ? {...this.tokens} : null;
    }

    hasTokens(): boolean {
        return Boolean(readAccess(this.tokens) || readRefresh(this.tokens));
    }

    getApiBaseUrl(): string {
        return getApiBaseUrl(this.backendDomain);
    }

    getWsBaseUrl(): string {
        return resolveWsBaseUrl(this.backendDomain);
    }

    setSession(
        tokens: AuthTokens | null,
        backendDomain?: string | null,
        storageRevision?: number,
        authRevision?: number
    ): void {
        if (storageRevision === undefined || storageRevision >= this.storageRevision) {
            if (storageRevision !== undefined) this.storageRevision = storageRevision;
            if (backendDomain !== undefined) this.backendDomain = backendDomain;
        }
        if (authRevision !== undefined && authRevision < this.authRevision) return;
        if (authRevision !== undefined) this.authRevision = authRevision;
        const normalized = normalizeTokens(tokens);
        if (!normalized && this.tokens) this.sessionGeneration += 1;
        this.tokens = normalized;
    }

    async loadSession(): Promise<AuthTokens | null> {
        const snapshot = await this.persistence.read();
        const persistedTokens = normalizeTokens(snapshot.tokens);
        this.setSession(
            persistedTokens,
            snapshot.backendDomain,
            snapshot.storageRevision,
            snapshot.authRevision
        );
        if (this.hasTokens()) {
            TokenStorage.clear();
            return this.getTokens();
        }

        const legacyTokens = TokenStorage.read();
        if (!legacyTokens) {
            return this.getTokens();
        }
        let persisted: AuthPersistenceSnapshot;
        try {
            persisted = await this.persistence.write(
                legacyTokens,
                snapshot.authRevision,
                snapshot.backendDomain
            );
        } catch (error) {
            if (snapshot.authRevision === undefined && snapshot.backendDomain == null) throw error;
            const latest = await this.persistence.read();
            this.setSession(
                latest.tokens,
                latest.backendDomain,
                latest.storageRevision,
                latest.authRevision
            );
            const authChanged = snapshot.authRevision !== undefined
                && latest.authRevision !== snapshot.authRevision;
            const domainChanged = snapshot.backendDomain != null
                && latest.backendDomain !== snapshot.backendDomain;
            if (!authChanged && !domainChanged) throw error;
            TokenStorage.clear();
            return this.getTokens();
        }
        this.setSession(
            persisted.tokens,
            persisted.backendDomain,
            persisted.storageRevision,
            persisted.authRevision
        );
        TokenStorage.clear();
        return this.getTokens();
    }

    async storeTokens(tokens: AuthTokens, expectedBackendDomain?: string | null): Promise<void> {
        const normalized = normalizeTokens(tokens);
        if (!normalized?.access) throw new AuthError('The server did not return an access token.');
        const generation = this.sessionGeneration;
        const expectedAuthRevision = this.authRevision >= 0 ? this.authRevision : undefined;
        await this.withRefreshLock(() => this.storeTokensUnlocked(
            normalized,
            generation,
            expectedAuthRevision,
            expectedBackendDomain
        ));
    }

    async clearTokens(): Promise<boolean> {
        const expectedAuthRevision = this.authRevision >= 0 ? this.authRevision : undefined;
        const expectedBackendDomain = this.backendDomain;
        this.invalidateSession();
        return this.withRefreshLock(() => this.clearTokensUnlocked(
            expectedAuthRevision,
            expectedBackendDomain
        ));
    }

    async login(email: string, password: string): Promise<User> {
        await this.loadSession();
        const domain = this.backendDomain;
        try {
            const {data} = await axios.post<TokenResponsePayload>(
                getAuthEndpoint(domain),
                {email, password},
                {
                    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
                    timeout: AUTH_REQUEST_TIMEOUT_MS
                }
            );
            await this.storeTokens(this.parseTokenResponse(data), domain);
            if (this.isUser(data.user)) return data.user;
            return await this.getCurrentUser(true);
        } catch (error) {
            throw normalizeAuthError(error);
        }
    }

    async logout(): Promise<boolean> {
        const refresh = readRefresh(this.tokens);
        const expectedAuthRevision = this.authRevision >= 0 ? this.authRevision : undefined;
        const expectedBackendDomain = this.backendDomain;
        let cleared = false;
        this.invalidateSession();
        try {
            if (refresh) {
                await axios.post(
                    `${getApiBaseUrl(expectedBackendDomain)}/auth/logout/`,
                    {refresh},
                    {
                        headers: {'Content-Type': 'application/json'},
                        timeout: AUTH_REQUEST_TIMEOUT_MS
                    }
                );
            }
        } catch (error) {
            const normalized = normalizeAuthError(error);
            console.warn('[auth] Server logout was unavailable', {
                status: normalized.status,
                code: normalized.code
            });
        } finally {
            cleared = await this.withRefreshLock(() => this.clearTokensUnlocked(
                expectedAuthRevision,
                expectedBackendDomain
            ));
        }
        return cleared;
    }

    async refreshAccessToken(backendDomain?: string | null): Promise<string> {
        this.isBackendCurrent(backendDomain);
        const targetBackendDomain = backendDomain ?? this.backendDomain;
        const operationAuthRevision = this.authRevision;
        const operationGeneration = this.sessionGeneration;
        if (
            this.refreshOperation?.backendDomain === targetBackendDomain
            && this.refreshOperation.authRevision === operationAuthRevision
            && this.refreshOperation.sessionGeneration === operationGeneration
        ) {
            return this.refreshOperation.promise;
        }
        const refreshToken = readRefresh(this.tokens);
        if (!refreshToken) {
            throw new AuthError('Refresh token is missing.', 401, undefined, 'refresh_token_missing');
        }

        const promise = this.withRefreshLock(async () => {
            const generation = this.sessionGeneration;
            const snapshot = await this.persistence.read();
            const persistedTokens = normalizeTokens(snapshot.tokens);
            const persistedRefresh = readRefresh(persistedTokens);
            const persistedDomain = snapshot.backendDomain ?? this.backendDomain;
            if (
                backendDomain != null
                && persistedDomain != null
                && backendDomain !== persistedDomain
            ) {
                this.setSession(
                    persistedTokens,
                    snapshot.backendDomain,
                    snapshot.storageRevision,
                    snapshot.authRevision
                );
                throw this.sessionChangedError();
            }
            if (generation !== this.sessionGeneration) throw this.sessionChangedError();
            if (!persistedRefresh) {
                this.setSession(
                    null,
                    snapshot.backendDomain,
                    snapshot.storageRevision,
                    snapshot.authRevision
                );
                throw new AuthError('Refresh token is missing.', 401, undefined, 'refresh_token_missing');
            }
            if (persistedTokens?.access && persistedRefresh && persistedRefresh !== refreshToken) {
                this.setSession(
                    persistedTokens,
                    snapshot.backendDomain,
                    snapshot.storageRevision,
                    snapshot.authRevision
                );
                return persistedTokens.access;
            }

            const domain = persistedDomain;
            try {
                const {data} = await axios.post<TokenResponsePayload>(
                    getAuthRefreshEndpoint(domain),
                    {refresh: refreshToken},
                    {
                        headers: {'Content-Type': 'application/json'},
                        timeout: AUTH_REQUEST_TIMEOUT_MS
                    }
                );
                const tokens = this.parseTokenResponse(data, refreshToken);
                await this.storeTokensUnlocked(
                    tokens,
                    generation,
                    snapshot.authRevision,
                    domain
                );
                return tokens.access;
            } catch (error) {
                const normalized = normalizeAuthError(error);
                if (isTerminalAuthError(normalized)) {
                    const cleared = await this.clearTokensUnlocked(
                        snapshot.authRevision,
                        domain
                    );
                    if (!cleared) throw this.sessionChangedError();
                }
                throw normalized;
            }
        }).finally(() => {
            if (this.refreshOperation?.promise === promise) this.refreshOperation = null;
        });
        this.refreshOperation = {
            backendDomain: targetBackendDomain,
            authRevision: operationAuthRevision,
            sessionGeneration: operationGeneration,
            promise
        };

        return promise;
    }

    async getCurrentUser(includeExtras: boolean = false): Promise<User> {
        const backendDomain = this.backendDomain;
        const baseMeEndpoint = getMeEndpoint(backendDomain);
        const url = includeExtras ? `${baseMeEndpoint}?tiers_and_features=WINKY` : baseMeEndpoint;
        return this.authenticatedRequest<User>({url, method: 'GET'}, backendDomain);
    }

    createHttpClient(backendDomain?: string | null): AxiosInstance {
        const targetBackendDomain = backendDomain ?? this.backendDomain;
        const client = axios.create({
            baseURL: getApiBaseUrl(targetBackendDomain),
            headers: {'Content-Type': 'application/json'},
            timeout: AUTH_REQUEST_TIMEOUT_MS
        });

        client.interceptors.request.use(async (config) => {
            const access = await this.getAccessToken(targetBackendDomain);
            config.headers.set('Authorization', `Bearer ${access}`);
            return config;
        });
        client.interceptors.response.use(
            (response) => response,
            async (error: AxiosError) => {
                const request = error.config;
                if (error.response?.status !== 401 || !request || isRetriedRequest(request)) {
                    throw normalizeAuthError(error);
                }
                markRetriedRequest(request);
                const access = await this.refreshAccessToken(targetBackendDomain);
                request.headers.set('Authorization', `Bearer ${access}`);
                return client.request(request);
            }
        );
        return client;
    }

    async authenticatedRequest<T>(config: AxiosRequestConfig, backendDomain?: string | null): Promise<T> {
        const client = this.createHttpClient(backendDomain);
        try {
            const response = await client.request<T>(config);
            return response.data;
        } catch (error) {
            throw normalizeAuthError(error);
        }
    }

    async getAuthMethods(): Promise<AuthMethodsResponse> {
        const snapshot = await this.persistence.read();
        const backendDomain = snapshot.backendDomain ?? this.backendDomain;
        try {
            const {data} = await axios.get<AuthMethodsResponse>(getAuthMethodsEndpoint(backendDomain), {
                headers: {Accept: 'application/json'},
                timeout: AUTH_REQUEST_TIMEOUT_MS
            });
            return data;
        } catch (error) {
            throw normalizeAuthError(error);
        }
    }

    private async getAccessToken(backendDomain?: string | null): Promise<string> {
        this.isBackendCurrent(backendDomain);
        const access = readAccess(this.tokens);
        if (access) return access;
        if (readRefresh(this.tokens)) return this.refreshAccessToken(backendDomain);
        throw new AuthError('Please sign in to continue.', 401, undefined, 'auth_session_missing');
    }

    private isBackendCurrent(backendDomain?: string | null): void {
        if (
            backendDomain != null
            && this.backendDomain != null
            && backendDomain !== this.backendDomain
        ) {
            throw this.sessionChangedError();
        }
    }

    private async storeTokensUnlocked(
        tokens: AuthTokens,
        generation: number,
        expectedAuthRevision?: number,
        expectedBackendDomain?: string | null
    ): Promise<void> {
        if (generation !== this.sessionGeneration) throw this.sessionChangedError();
        let persisted: AuthPersistenceSnapshot;
        try {
            persisted = await this.persistence.write(
                tokens,
                expectedAuthRevision,
                expectedBackendDomain
            );
        } catch (error) {
            if (expectedAuthRevision === undefined && expectedBackendDomain == null) throw error;
            const latest = await this.persistence.read();
            this.setSession(
                latest.tokens,
                latest.backendDomain,
                latest.storageRevision,
                latest.authRevision
            );
            const authChanged = expectedAuthRevision !== undefined
                && latest.authRevision !== expectedAuthRevision;
            const domainChanged = expectedBackendDomain != null
                && latest.backendDomain !== expectedBackendDomain;
            if (authChanged || domainChanged) throw this.sessionChangedError();
            throw error;
        }
        if (generation !== this.sessionGeneration) {
            await this.clearTokensUnlocked(persisted.authRevision, persisted.backendDomain);
            throw this.sessionChangedError();
        }
        this.setSession(
            persisted.tokens,
            persisted.backendDomain,
            persisted.storageRevision,
            persisted.authRevision
        );
        TokenStorage.clear();
    }

    private async clearTokensUnlocked(
        expectedAuthRevision?: number,
        expectedBackendDomain?: string | null
    ): Promise<boolean> {
        let persisted: AuthPersistenceSnapshot;
        try {
            persisted = await this.persistence.write(
                null,
                expectedAuthRevision,
                expectedBackendDomain
            );
        } catch (error) {
            if (expectedAuthRevision === undefined && expectedBackendDomain == null) throw error;
            const latest = await this.persistence.read();
            this.setSession(
                latest.tokens,
                latest.backendDomain,
                latest.storageRevision,
                latest.authRevision
            );
            const authChanged = expectedAuthRevision !== undefined
                && latest.authRevision !== expectedAuthRevision;
            const domainChanged = expectedBackendDomain != null
                && latest.backendDomain !== expectedBackendDomain;
            if (!authChanged && !domainChanged) throw error;
            TokenStorage.clear();
            return false;
        }
        this.setSession(
            null,
            persisted.backendDomain,
            persisted.storageRevision,
            persisted.authRevision
        );
        TokenStorage.clear();
        return true;
    }

    private invalidateSession(): void {
        this.sessionGeneration += 1;
        this.tokens = null;
        TokenStorage.clear();
    }

    private sessionChangedError(): AuthError {
        const error = new AuthError('Authentication session changed.', 401, undefined, 'auth_session_changed');
        error.name = 'AbortError';
        return error;
    }

    private parseTokenResponse(
        payload: TokenResponsePayload,
        fallbackRefresh: string | null = null
    ): AuthTokens {
        const access = typeof payload.access === 'string' ? payload.access : '';
        const refresh = typeof payload.refresh === 'string' ? payload.refresh : fallbackRefresh;
        if (!access) throw new AuthError('The server did not return an access token.');
        return {access, refresh};
    }

    private isUser(value: unknown): value is User {
        if (!value || typeof value !== 'object') return false;
        const record = value as Record<string, unknown>;
        return typeof record.id === 'number' && typeof record.email === 'string';
    }

    private async withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
        if (typeof navigator === 'undefined' || !navigator.locks) return operation();
        return navigator.locks.request(REFRESH_LOCK_NAME, operation);
    }
}
