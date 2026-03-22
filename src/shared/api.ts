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
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    if (!baseURL) {
        return url;
    }
    try {
        const normalizedBase = baseURL.startsWith('http://') || baseURL.startsWith('https://')
            ? baseURL
            : typeof window !== 'undefined'
                ? new URL(baseURL, window.location.origin).toString()
                : '';
        if (!normalizedBase) {
            return url;
        }
        return new URL(url, normalizedBase).toString();
    } catch {
        return url;
    }
};

export const createApiClient = (
    accessToken?: string,
    sendToRenderer?: (message: string, data?: any) => void,
    backendDomain?: string | null
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

    // Request interceptor для логирования
    instance.interceptors.request.use(
        (config) => {
            const method = config.method?.toUpperCase() || 'GET';
            const url = config.url || '';
            const fullUrl = getLogUrl(url, config.baseURL);

            console.log(`%cAPI → %c[${method}] %c${fullUrl}`,
                'color: #10b981; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6'
            );

            if (config.data) {
                console.log('  📤 Request data:', config.data);
            }

            // Отправляем в renderer если доступна функция
            if (sendToRenderer) {
                sendToRenderer('api-request', {method, url: fullUrl, data: config.data});
            }

            return config;
        },
        (error) => {
            console.error('%cAPI → ERROR', 'color: #ef4444; font-weight: bold', error);
            if (sendToRenderer) {
                sendToRenderer('api-error', {error: error.message});
            }
            return Promise.reject(error);
        }
    );

    // Response interceptor для логирования
    instance.interceptors.response.use(
        (response) => {
            const method = response.config.method?.toUpperCase() || 'GET';
            const url = response.config.url || '';
            const fullUrl = getLogUrl(url, response.config.baseURL);
            const status = response.status;

            console.log(`%cAPI ← %c[${method}] %c${fullUrl} %c[${status}]`,
                'color: #10b981; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #22c55e; font-weight: bold'
            );

            console.log('  📥 Response data:', response.data);

            // Отправляем в renderer если доступна функция
            if (sendToRenderer) {
                sendToRenderer('api-response', {method, url: fullUrl, status, data: response.data});
            }

            return response;
        },
        (error) => {
            const method = error.config?.method?.toUpperCase() || 'GET';
            const url = error.config?.url || 'unknown';
            const fullUrl = url === 'unknown' ? url : getLogUrl(url, error.config?.baseURL);
            const status = error.response?.status || 'N/A';

            console.error(`%cAPI ← %c[${method}] %c${fullUrl} %c[${status}]`,
                'color: #ef4444; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #ef4444; font-weight: bold'
            );

            if (error.response?.data) {
                console.error('  ❌ Error data:', error.response.data);
            } else {
                console.error('  ❌ Error:', error.message);
            }

            // При 401 эмитим событие для глобальной обработки (разлогинивание)
            if (status === 401) {
                triggerUnauthorized();
            }

            // Отправляем в renderer если доступна функция
            if (sendToRenderer) {
                sendToRenderer('api-response-error', {
                    method,
                    url: fullUrl,
                    status,
                    error: error.response?.data || error.message
                });
            }

            return Promise.reject(error);
        }
    );

    return instance;
};

// Убираем экспорт singleton, т.к. в коде он не используется
