import {emit} from '@tauri-apps/api/event';

export const notificationsBridge = {
    showToast: (message: string, type: 'success' | 'info' | 'error' = 'info', options?: {durationMs?: number}) =>
        emit('app:toast', {message, type, options})
};
