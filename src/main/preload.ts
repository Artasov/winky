import {contextBridge, ipcRenderer, IpcRendererEvent} from 'electron';
import type {
    ActionConfig,
    ActionIcon,
    AppConfig,
    AuthDeepLinkPayload,
    AuthProvider,
    AuthTokens,
    FastWhisperStatus,
    User,
    WinkyProfile
} from '@shared/types';
import {IPC_CHANNELS} from '@shared/constants';

type UpdateConfigPayload = Partial<AppConfig>;
type LoginResponse = {
    tokens: AuthTokens;
    user?: Record<string, unknown>;
    config: AppConfig;
};

// Слушаем логи API из main process и выводим в консоль браузера
ipcRenderer.on('api-log', (_event, {type, data}) => {
    switch (type) {
        case 'api-request':
            console.log(`%cAPI → %c[${data.method}] %c${data.url}`,
                'color: #10b981; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6'
            );
            if (data.data) {
                console.log('  📤 Request data:', data.data);
            }
            break;
        case 'api-response':
            console.log(`%cAPI ← %c[${data.method}] %c${data.url} %c[${data.status}]`,
                'color: #10b981; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #22c55e; font-weight: bold'
            );
            console.log('  📥 Response data:', data.data);
            break;
        case 'api-error':
        case 'api-response-error':
            console.error(`%cAPI ← %c[${data.method}] %c${data.url} %c[${data.status}]`,
                'color: #ef4444; font-weight: bold',
                'color: #3b82f6; font-weight: bold',
                'color: #8b5cf6',
                'color: #ef4444; font-weight: bold'
            );
            console.error('  ❌ Error:', data.error);
            break;
    }
});

const api = {
    config: {
        get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
        update: (payload: UpdateConfigPayload): Promise<AppConfig> => ipcRenderer.invoke('config:update', payload),
        setAuth: (tokens: AuthTokens): Promise<AppConfig> => ipcRenderer.invoke('config:setAuth', tokens),
        reset: (): Promise<AppConfig> => ipcRenderer.invoke('config:reset'),
        path: (): Promise<string> => ipcRenderer.invoke('config:path'),
        subscribe: (listener: (config: AppConfig) => void): (() => void) => {
            const handler = (_event: IpcRendererEvent, updated: AppConfig) => {
                listener(updated);
            };
            ipcRenderer.on('config:updated', handler);
            return () => {
                ipcRenderer.removeListener('config:updated', handler);
            };
        }
    },
    clipboard: {
        writeText: (text: string): Promise<boolean> => ipcRenderer.invoke('clipboard:write', text)
    },
    auth: {
        login: (email: string, password: string): Promise<LoginResponse> =>
            ipcRenderer.invoke('auth:login', {email, password}),
        logout: (): Promise<boolean> => ipcRenderer.invoke('auth:logout'),
        startOAuth: async (provider: AuthProvider): Promise<void> => {
            await ipcRenderer.invoke(IPC_CHANNELS.AUTH_START_OAUTH, provider);
        },
        onOAuthPayload: (cb: (payload: AuthDeepLinkPayload) => void): (() => void) => {
            const listeners = new Set<(payload: AuthDeepLinkPayload) => void>();

            const emit = (payload: AuthDeepLinkPayload) => {
                for (const listener of listeners) {
                    try {
                        listener(payload);
                    } catch {
                    }
                }
            };

            const handler = (_event: IpcRendererEvent, payload: AuthDeepLinkPayload) => {
                emit(payload);
            };

            ipcRenderer.on(IPC_CHANNELS.AUTH_DEEP_LINK, handler);
            listeners.add(cb);

            const consumePending = async () => {
                try {
                    const payloads = await ipcRenderer.invoke(IPC_CHANNELS.AUTH_CONSUME_DEEP_LINKS) as AuthDeepLinkPayload[];
                    if (Array.isArray(payloads) && payloads.length) {
                        for (const payload of payloads) {
                            emit(payload);
                        }
                    }
                    return payloads;
                } catch {
                    return [];
                }
            };

            void consumePending();

            return () => {
                listeners.delete(cb);
                ipcRenderer.removeListener(IPC_CHANNELS.AUTH_DEEP_LINK, handler);
            };
        },
        consumePendingOAuthPayloads: async (): Promise<AuthDeepLinkPayload[]> => {
            try {
                const payloads = await ipcRenderer.invoke(IPC_CHANNELS.AUTH_CONSUME_DEEP_LINKS) as AuthDeepLinkPayload[];
                return Array.isArray(payloads) ? payloads : [];
            } catch {
                return [];
            }
        }
    },
    actions: {
        fetch: (): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:fetch'),
        create: (action: {
            name: string;
            prompt: string;
            hotkey?: string;
            icon: string;
            show_results?: boolean;
            sound_on_complete?: boolean;
            auto_copy_result?: boolean
        }): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:create', action),
        update: (actionId: string, action: {
            name: string;
            prompt: string;
            hotkey?: string;
            icon: string;
            show_results?: boolean;
            sound_on_complete?: boolean;
            auto_copy_result?: boolean
        }): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:update', actionId, action),
        delete: (actionId: string): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:delete', actionId)
    },
    actionHotkeys: {
        register: (hotkeys: Array<{ id: string; accelerator: string }>): Promise<void> =>
            ipcRenderer.invoke('actions:hotkeys:register', hotkeys),
        clear: (): Promise<void> => ipcRenderer.invoke('actions:hotkeys:clear')
    },
    icons: {
        fetch: (): Promise<ActionIcon[]> => ipcRenderer.invoke('icons:fetch')
    },
    profile: {
        fetch: (): Promise<WinkyProfile> => ipcRenderer.invoke('profile:fetch')
    },
    user: {
        fetch: (): Promise<User | null> => ipcRenderer.invoke('user:fetch'),
        getCached: (): Promise<User | null> => ipcRenderer.invoke('user:get-cached')
    },
    speech: {
        transcribe: (audioData: ArrayBuffer, config: {
            mode: string;
            model: string;
            openaiKey?: string;
            googleKey?: string;
            accessToken?: string
        }): Promise<string> =>
            ipcRenderer.invoke('speech:transcribe', audioData, config)
    },
    localSpeech: {
        getStatus: (): Promise<FastWhisperStatus> => ipcRenderer.invoke('local-speech:get-status'),
        install: (): Promise<FastWhisperStatus> => ipcRenderer.invoke('local-speech:install'),
        start: (): Promise<FastWhisperStatus> => ipcRenderer.invoke('local-speech:start'),
        restart: (): Promise<FastWhisperStatus> => ipcRenderer.invoke('local-speech:restart'),
        reinstall: (): Promise<FastWhisperStatus> => ipcRenderer.invoke('local-speech:reinstall'),
        stop: (): Promise<FastWhisperStatus> => ipcRenderer.invoke('local-speech:stop'),
        onStatus: (callback: (status: FastWhisperStatus) => void): (() => void) => {
            const handler = (_event: IpcRendererEvent, status: FastWhisperStatus) => {
                callback(status);
            };
            ipcRenderer.on('local-speech:status', handler);
            return () => {
                ipcRenderer.removeListener('local-speech:status', handler);
            };
        }
    },
    llm: {
        process: (text: string, prompt: string, config: {
            mode: string;
            model: string;
            openaiKey?: string;
            googleKey?: string;
            accessToken?: string
        }): Promise<string> =>
            ipcRenderer.invoke('llm:process', text, prompt, config),
        processStream: (text: string, prompt: string, config: {
            mode: string;
            model: string;
            openaiKey?: string;
            googleKey?: string;
            accessToken?: string
        }): Promise<string> =>
            ipcRenderer.invoke('llm:process-stream', text, prompt, config)
    },
    result: {
        open: (): Promise<void> => ipcRenderer.invoke('result:open'),
        close: (): Promise<void> => ipcRenderer.invoke('result:close'),
        update: (data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }): Promise<void> =>
            ipcRenderer.invoke('result:update', data),
        onData: (callback: (data: {
            transcription?: string;
            llmResponse?: string;
            isStreaming?: boolean
        }) => void): (() => void) => {
            const handler = (_event: IpcRendererEvent, data: any) => {
                callback(data);
            };
            ipcRenderer.on('result:data', handler);
            return () => {
                ipcRenderer.removeListener('result:data', handler);
            };
        }
    },
    windows: {
        openSettings: (): Promise<void> => ipcRenderer.invoke('windows:open-settings'),
        navigate: (route: string): Promise<void> => ipcRenderer.invoke('windows:navigate', route)
    },
    notifications: {
        showToast: (
            message: string,
            type: 'success' | 'info' | 'error' = 'info',
            options?: { durationMs?: number }
        ): Promise<void> =>
            ipcRenderer.invoke('notifications:toast', {message, type, options})
    },
    windowControls: {
        minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
        close: (): Promise<void> => ipcRenderer.invoke('window:close')
    },
    mic: {
        moveWindow: (x: number, y: number): Promise<void> => ipcRenderer.invoke('mic:move-window', x, y),
        setInteractive: (interactive: boolean): Promise<void> => ipcRenderer.invoke('mic:set-interactive', interactive),
        getPosition: (): Promise<{ x: number; y: number }> => ipcRenderer.invoke('mic:get-position'),
        getCursorPosition: (): Promise<{ x: number; y: number }> => ipcRenderer.invoke('mic:get-cursor-position'),
        moveBy: (dx: number, dy: number): Promise<void> => ipcRenderer.invoke('mic:move-by', dx, dy),
        setAnchor: (anchor: string): Promise<{ x: number; y: number }> => ipcRenderer.invoke('mic:set-anchor', anchor),
        show: (reason?: string): Promise<void> => ipcRenderer.invoke('mic:show', reason),
        hide: (options?: {
            reason?: string;
            disableAutoShow?: boolean
        }): Promise<void> => ipcRenderer.invoke('mic:hide', options)
    },
    on: (channel: string, callback: (...args: any[]) => void) => {
        ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
        ipcRenderer.removeListener(channel, callback);
    }
};

contextBridge.exposeInMainWorld('winky', api);
contextBridge.exposeInMainWorld('electron', {
    on: (channel: string, callback: (...args: any[]) => void) => {
        ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
        ipcRenderer.removeListener(channel, callback);
    },
    windowControls: {
        minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
        close: (): Promise<void> => ipcRenderer.invoke('window:close')
    }
});

export type WinkyPreload = typeof api;
