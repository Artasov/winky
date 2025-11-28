import axios from 'axios';
import {API_BASE_URL} from './constants';

export const createApiClient = (accessToken?: string, sendToRenderer?: (message: string, data?: any) => void) => {
    const instance = axios.create({
        baseURL: API_BASE_URL,
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
            const fullUrl = url.startsWith('http') ? url : `${config.baseURL}${url}`;

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
            const fullUrl = url.startsWith('http') ? url : `${response.config.baseURL}${url}`;
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
            const fullUrl = url.startsWith('http') ? url : `${error.config?.baseURL}${url}`;
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
