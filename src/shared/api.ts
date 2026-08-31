import axios from 'axios';
import {getApiBaseUrl} from './constants';

type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();

export const onUnauthorized = (handler: UnauthorizedHandler): (() => void) => {
    unauthorizedHandlers.add(handler);
    return () => {
        unauthorizedHandlers.delete(handler);
    };
};

export const triggerUnauthorized = () => {
    unauthorizedHandlers.forEach((handler) => {
        try {
            handler();
        } catch (err) {
            console.error('[api] Unauthorized handler threw error', err);
        }
    });
};

const getLogUrl = (url: string, baseURL?: string): string => {
    if (!url) {
        return 'unknown';
    }
    try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const parsed = new URL(url);
            parsed.search = '';
            parsed.hash = '';
            return parsed.toString();
        }
        if (!baseURL) return url.split(/[?#]/, 1)[0];
        const normalizedBase = baseURL.startsWith('http://') || baseURL.startsWith('https://')
            ? baseURL
            : typeof window !== 'undefined'
                ? new URL(baseURL, window.location.origin).toString()
                : '';
        if (!normalizedBase) {
            return url;
        }
        const parsed = new URL(url, normalizedBase);
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return url;
    }
};

export const createApiClient = (
    accessToken?: string,
    sendToRenderer?: (message: string, data?: unknown) => void,
    backendDomain?: string | null,
    emitUnauthorizedOn401: boolean = true
) => {
    const instance = axios.create({
        baseURL: getApiBaseUrl(backendDomain),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (accessToken) {
        instance.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    }

    instance.interceptors.request.use(
        (config) => {
            const method = config.method?.toUpperCase() || 'GET';
            const url = config.url || '';
            const fullUrl = getLogUrl(url, config.baseURL);

            console.debug(`[api] → [${method}] ${fullUrl}`);

            if (sendToRenderer) {
                sendToRenderer('api-request', {method, url: fullUrl});
            }

            return config;
        },
        (error) => {
            console.error('[api] Request failed before receiving a response', error?.message ?? error);
            if (sendToRenderer) {
                sendToRenderer('api-error', {error: error.message});
            }
            return Promise.reject(error);
        }
    );

    instance.interceptors.response.use(
        (response) => {
            const method = response.config.method?.toUpperCase() || 'GET';
            const url = response.config.url || '';
            const fullUrl = getLogUrl(url, response.config.baseURL);
            const status = response.status;

            console.debug(`[api] ← [${method}] ${fullUrl} [${status}]`);

            if (sendToRenderer) {
                sendToRenderer('api-response', {method, url: fullUrl, status});
            }

            return response;
        },
        (error) => {
            const method = error.config?.method?.toUpperCase() || 'GET';
            const url = error.config?.url || 'unknown';
            const fullUrl = url === 'unknown' ? url : getLogUrl(url, error.config?.baseURL);
            const status = error.response?.status || 'N/A';

            console.error(`[api] ← [${method}] ${fullUrl} [${status}]`, error.message);

            if (status === 401 && emitUnauthorizedOn401) {
                triggerUnauthorized();
            }

            if (sendToRenderer) {
                sendToRenderer('api-response-error', {
                    method,
                    url: fullUrl,
                    status,
                    error: error.message
                });
            }

            return Promise.reject(error);
        }
    );

    return instance;
};

// Убираем экспорт singleton, т.к. в коде он не используется
