import axios, {AxiosRequestConfig} from 'axios';
import {getApiBaseUrl, getAuthEndpoint, getAuthRefreshEndpoint, getMeEndpoint} from '@shared/constants';
import type {AuthTokens, User} from '@shared/types';
import {TokenStorage} from './TokenStorage';

export class AuthError extends Error {
    public status?: number;
    public details?: unknown;

    constructor(message: string, status?: number, details?: unknown) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
        this.details = details;
    }
}

type TokenResponsePayload = {
    access?: unknown;
    refresh?: unknown;
    [key: string]: unknown;
};

const extractMessage = (payload: unknown, fallback: string): string => {
    if (!payload) {
        return fallback;
    }
    if (typeof payload === 'string') {
        return payload.trim().length ? payload.trim() : fallback;
    }
    if (Array.isArray(payload) && payload.length) {
        return extractMessage(payload[0], fallback);
    }
    if (typeof payload !== 'object') {
        return fallback;
    }
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === 'string' && record.detail.trim()) {
        return record.detail.trim();
    }
    if (typeof record.message === 'string' && record.message.trim()) {
        return record.message.trim();
    }
    if (Array.isArray(record.non_field_errors) && record.non_field_errors.length) {
        return extractMessage(record.non_field_errors[0], fallback);
    }
    const firstKey = Object.keys(record).find((key) => {
        const value = record[key];
        return typeof value === 'string' || (Array.isArray(value) && value.length);
    });
    if (firstKey) {
        return extractMessage(record[firstKey], fallback);
    }
    return fallback;
};

const normalizeError = (error: unknown): AuthError => {
    if (error instanceof AuthError) {
        return error;
    }
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const payload = error.response?.data;
        const fallback = status ? `Request failed with status ${status}` : 'Network request failed';
        const message = extractMessage(payload, fallback);
        return new AuthError(message || fallback, status, payload);
    }
    if (error instanceof Error) {
        return new AuthError(error.message);
    }
    return new AuthError(String(error ?? 'Unknown error'));
};

const shouldUseBaseUrl = (url?: string): boolean => {
    if (!url) {
        return true;
    }
    if (url.startsWith('/')) {
        return false;
    }
    return !/^https?:\/\//i.test(url);
};

export class AuthService {
    private tokens: AuthTokens | null = null;
    private refreshPromise: Promise<string | null> | null = null;

    constructor() {
        this.tokens = TokenStorage.read();
    }

    getTokens(): AuthTokens | null {
        return this.tokens ? {...this.tokens} : null;
    }

    hasTokens(): boolean {
        return Boolean(this.tokens?.access);
    }

    clearTokens(): void {
        this.tokens = null;
        TokenStorage.write(null);
    }

    storeTokens(tokens: AuthTokens): void {
        this.tokens = {...tokens};
        TokenStorage.write(this.tokens);
    }

    async login(email: string, password: string): Promise<User> {
        try {
            const {data} = await axios.post(getAuthEndpoint(), {email, password}, {
                headers: {'Content-Type': 'application/json', Accept: 'application/json'}
            });
            const tokens = this.parseTokenResponse(data);
            this.storeTokens(tokens);
        } catch (error) {
            throw normalizeError(error);
        }

        try {
            return await this.getCurrentUser(true);
        } catch (error) {
            this.clearTokens();
            throw normalizeError(error);
        }
    }

    async refreshAccessToken(): Promise<string | null> {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }
        const refreshToken = this.tokens?.refresh;
        if (!refreshToken) {
            this.clearTokens();
            return null;
        }

        this.refreshPromise = (async () => {
            try {
                const {data} = await axios.post(getAuthRefreshEndpoint(), {refresh: refreshToken}, {
                    headers: {'Content-Type': 'application/json'}
                });
                const tokens = this.parseTokenResponse(data);
                this.storeTokens(tokens);
                return tokens.access;
            } catch (error) {
                this.clearTokens();
                throw normalizeError(error);
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    async getCurrentUser(includeExtras: boolean = false): Promise<User> {
        const baseMeEndpoint = getMeEndpoint();
        const url = includeExtras ? `${baseMeEndpoint}?tiers_and_features=WINKY` : baseMeEndpoint;
        console.log('[AuthService] → [GET]', url);
        try {
            const result = await this.authenticatedRequest<User>({url, method: 'GET'});
            console.log('[AuthService] ← [GET]', url, '[200]');
            console.log('  📥 Response data:', result);
            return result;
        } catch (error) {
            console.error('[AuthService] ← [GET]', url, '[ERROR]', error);
            throw error;
        }
    }

    async authenticatedRequest<T>(config: AxiosRequestConfig): Promise<T> {
        const accessToken = await this.ensureAccessToken();
        if (!accessToken) {
            throw new AuthError('Please sign in to continue.');
        }

        try {
            const response = await axios.request<T>({
                ...config,
                baseURL: shouldUseBaseUrl(config.url) ? getApiBaseUrl() : undefined,
                headers: {
                    ...(config.headers ?? {}),
                    Authorization: `Bearer ${accessToken}`
                }
            });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                this.clearTokens();
            }
            throw normalizeError(error);
        }
    }

    private async ensureAccessToken(): Promise<string | null> {
        const accessToken = this.tokens?.access;
        if (!accessToken) {
            return this.refreshAccessToken();
        }
        return accessToken;
    }

    private parseTokenResponse(payload: TokenResponsePayload): AuthTokens {
        const access = typeof payload.access === 'string' ? payload.access : '';
        const refresh = typeof payload.refresh === 'string' ? payload.refresh : null;
        if (!access) {
            throw new AuthError('The server did not return an access token.');
        }
        return {access, refresh};
    }
}
