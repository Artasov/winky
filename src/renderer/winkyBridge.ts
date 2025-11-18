import {invoke} from '@tauri-apps/api/core';
import {cursorPosition, getCurrentWindow, LogicalPosition} from '@tauri-apps/api/window';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {listen, emit, EventCallback, UnlistenFn} from '@tauri-apps/api/event';
import type {
    ActionConfig,
    ActionIcon,
    AppConfig,
    AuthDeepLinkPayload,
    FastWhisperStatus,
    MicAnchor,
    WinkyProfile
} from '@shared/types';
import {MIC_WINDOW_HEIGHT, MIC_WINDOW_MARGIN, MIC_WINDOW_WIDTH} from '@shared/constants';
import {
    fetchActions,
    createAction,
    updateAction,
    deleteAction,
    fetchIcons,
    fetchProfile,
    fetchCurrentUser,
    transcribeAudio,
    processLLM,
    processLLMStream,
    ActionPayload,
    SpeechTranscribeConfig
} from './services/winkyApi';

const resolveWindowKind = (): 'main' | 'mic' | 'result' | 'error' => {
    if (typeof window === 'undefined') {
        return 'main';
    }
    const params = new URLSearchParams(window.location.search);
    const label = params.get('window');
    if (!label) {
        return 'main';
    }
    if (label === 'mic' || label === 'result' || label === 'error') {
        return label;
    }
    return 'main';
};

const currentWindowKind = resolveWindowKind();
const currentWindow = getCurrentWindow();

const openDevtools = async () => {
    try {
        await currentWindow.openDevtools();
    } catch {
        // Если прямой вызов не работает, пробуем через команду
        try {
            await invoke('window_open_devtools');
        } catch {
            // Игнорируем ошибки
        }
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (event) => {
        const isAccel = event.ctrlKey || event.metaKey;
        if ((isAccel && event.shiftKey && event.code === 'KeyI') || event.code === 'F12') {
            event.preventDefault();
            openDevtools();
        }
    });
}

const configSubscribers = new Set<(config: AppConfig) => void>();
let configUnlisten: UnlistenFn | null = null;

const ensureConfigSubscription = async () => {
    if (configUnlisten) {
        return;
    }
    configUnlisten = await listen<AppConfig>('config:updated', (event) => {
        const payload = event.payload;
        configSubscribers.forEach((listener) => listener(payload));
    });
};

const configApi = {
    get: (): Promise<AppConfig> => invoke('config_get'),
    update: (payload: Partial<AppConfig>): Promise<AppConfig> => invoke('config_update', {payload}),
    setAuth: (tokens: AppConfig['auth']): Promise<AppConfig> => invoke('config_set_auth', {tokens}),
    reset: (): Promise<AppConfig> => invoke('config_reset'),
    path: (): Promise<string> => invoke('config_path'),
    subscribe: (listener: (config: AppConfig) => void) => {
        void ensureConfigSubscription();
        configSubscribers.add(listener);
        return () => configSubscribers.delete(listener);
    }
};

const resourcesApi = {
    getSoundPath: (soundName: string): Promise<string> => invoke('resources_sound_path', {soundName})
};

const clipboardApi = {
    writeText: async (text: string) => {
        try {
            await navigator.clipboard.writeText(text ?? '');
            return true;
        } catch {
            return false;
        }
    }
};

const authListeners = new Set<(payload: AuthDeepLinkPayload) => void>();
let authUnlisten: UnlistenFn | null = null;

const ensureAuthSubscription = async () => {
    if (authUnlisten) {
        return;
    }
    authUnlisten = await listen<AuthDeepLinkPayload>('auth:deep-link', (event) => {
        authListeners.forEach((listener) => listener(event.payload));
    });
};

const authApi = {
    startOAuth: (provider: string) => invoke('auth_start_oauth', {provider}),
    onOAuthPayload: (callback: (payload: AuthDeepLinkPayload) => void) => {
        void ensureAuthSubscription();
        authListeners.add(callback);
        return () => authListeners.delete(callback);
    },
    consumePendingOAuthPayloads: (): Promise<AuthDeepLinkPayload[]> => invoke('auth_consume_pending')
};

const actionsApi = {
    fetch: (): Promise<ActionConfig[]> => fetchActions(),
    create: (payload: ActionPayload): Promise<ActionConfig[]> => createAction(payload),
    update: (id: string, payload: ActionPayload): Promise<ActionConfig[]> => updateAction(id, payload),
    delete: (id: string): Promise<ActionConfig[]> => deleteAction(id)
};

const iconsApi = {
    fetch: (): Promise<ActionIcon[]> => fetchIcons()
};

const profileApi = {
    fetch: (): Promise<WinkyProfile> => fetchProfile(),
    currentUser: (options?: {includeTiersAndFeatures?: boolean}) => fetchCurrentUser(options)
};

const speechApi = {
    transcribe: (audioData: ArrayBuffer, config: SpeechTranscribeConfig) => transcribeAudio(audioData, config)
};

const llmApi = {
    process: (text: string, prompt: string, config: {mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string}) =>
        processLLM(text, prompt, config),
    processStream: (text: string, prompt: string, config: {mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string}) =>
        processLLMStream(text, prompt, config)
};

class AuxWindowController {
    private window: WebviewWindow | null = null;

    constructor(
        private readonly label: string,
        private readonly route: string,
        private readonly options?: Record<string, unknown>
    ) {}

    private buildUrl(): string {
        const base = window.location.href.split('#')[0].split('?')[0];
        const searchParams = new URLSearchParams({window: this.label});
        return `${base}?${searchParams.toString()}#${this.route}`;
    }

    async ensure(): Promise<WebviewWindow> {
        if (this.window) {
            return this.window;
        }
        const existing = await WebviewWindow.getByLabel(this.label);
        if (existing) {
            this.window = existing;
            return existing;
        }
        const win = new WebviewWindow(this.label, {
            url: this.buildUrl(),
            title: 'Winky',
            focus: false,
            ...(this.options ?? {})
        } as any);
        void win.once('tauri://destroyed', () => {
            this.window = null;
        });
        this.window = win;
        return win;
    }

    async show() {
        const win = await this.ensure();
        await win.show();
        await win.setFocus();
    }

    async hide() {
        if (!this.window) {
            return;
        }
        try {
            await this.window.hide();
        } catch {
            this.window = null;
        }
    }

    async close() {
        if (!this.window) {
            return;
        }
        try {
            await this.window.close();
        } catch {
            /* ignore */
        } finally {
            this.window = null;
        }
    }

    async emit<T>(event: string, payload: T) {
        await emit(event, payload);
    }
}

const resultWindow = new AuxWindowController('result', 'result', {
    width: 700,
    height: 600,
    resizable: true,
    decorations: false
});

const errorWindow = new AuxWindowController('error', 'error', {
    width: 520,
    height: 360,
    decorations: false
});

const resultApi = {
    open: () => resultWindow.show(),
    close: () => resultWindow.close(),
    update: (payload: any) => emit('result:data', payload),
    onData: (callback: EventCallback<any>) => {
        const unlistenPromise = listen('result:data', callback);
        return () => {
            unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
        };
    }
};

const windowsApi = {
    openSettings: () => emit('navigate-to', '/settings'),
    navigate: (route: string) => emit('navigate-to', route)
};

const notificationsApi = {
    showToast: (message: string, type: 'success' | 'info' | 'error' = 'info', options?: {durationMs?: number}) =>
        emit('app:toast', {message, type, options})
};

const windowControlsApi = {
    minimize: () => currentWindow.minimize(),
    close: () => currentWindow.close(),
    openDevtools
};

class MicWindowController {
    private window: WebviewWindow | null = null;
    private position: {x: number; y: number} = {x: MIC_WINDOW_MARGIN, y: MIC_WINDOW_MARGIN};
    private moveUnlisten: UnlistenFn | null = null;
    private positionLoaded = false;
    private visible = false;

    private buildUrl(): string {
        const base = window.location.href.split('#')[0].split('?')[0];
        const params = new URLSearchParams({window: 'mic'});
        return `${base}?${params.toString()}#/mic`;
    }

    private async ensure(): Promise<WebviewWindow> {
        await this.ensureInitialPosition();
        if (this.window) {
            return this.window;
        }
        const existing = await WebviewWindow.getByLabel('mic');
        if (existing) {
            this.window = existing;
            await this.attachMoveListener(existing);
            return existing;
        }
        const win = new WebviewWindow('mic', {
            url: this.buildUrl(),
            title: 'Winky Mic',
            width: MIC_WINDOW_WIDTH,
            height: MIC_WINDOW_HEIGHT,
            resizable: false,
            alwaysOnTop: true,
            visible: false,
            transparent: true,
            decorations: false,
            skipTaskbar: true
        } as any);
        void win.once('tauri://destroyed', () => {
            this.window = null;
            if (this.moveUnlisten) {
                this.moveUnlisten();
                this.moveUnlisten = null;
            }
            this.visible = false;
        });
        this.window = win;
        await this.attachMoveListener(win);
        return win;
    }

    async moveWindow(x: number, y: number): Promise<void> {
        const win = await this.ensure();
        this.position = {x, y};
        await win.setPosition(new LogicalPosition(x, y));
        await configApi.update({micWindowPosition: {x, y}});
    }

    async moveBy(dx: number, dy: number): Promise<void> {
        const current = await this.getPosition();
        await this.moveWindow(current.x + dx, current.y + dy);
    }

    async setAnchor(anchor: MicAnchor): Promise<{x: number; y: number}> {
        const width = window.screen?.availWidth ?? MIC_WINDOW_WIDTH + MIC_WINDOW_MARGIN * 2;
        const height = window.screen?.availHeight ?? MIC_WINDOW_HEIGHT + MIC_WINDOW_MARGIN * 2;
        let x = MIC_WINDOW_MARGIN;
        let y = MIC_WINDOW_MARGIN;
        switch (anchor) {
            case 'top-right':
                x = width - MIC_WINDOW_WIDTH - MIC_WINDOW_MARGIN;
                y = MIC_WINDOW_MARGIN;
                break;
            case 'bottom-left':
                x = MIC_WINDOW_MARGIN;
                y = height - MIC_WINDOW_HEIGHT - MIC_WINDOW_MARGIN;
                break;
            case 'bottom-right':
                x = width - MIC_WINDOW_WIDTH - MIC_WINDOW_MARGIN;
                y = height - MIC_WINDOW_HEIGHT - MIC_WINDOW_MARGIN;
                break;
            default:
                x = MIC_WINDOW_MARGIN;
                y = MIC_WINDOW_MARGIN;
        }
        await this.moveWindow(x, y);
        await configApi.update({micAnchor: anchor});
        return {x, y};
    }

    async getPosition(): Promise<{x: number; y: number}> {
        return this.position;
    }

    async getCursorPosition(): Promise<{x: number; y: number}> {
        const cursor = await cursorPosition();
        return {x: cursor.x, y: cursor.y};
    }

    async show(reason: string = 'system'): Promise<void> {
        if (this.visible) {
            const win = await this.ensure();
            await win.show();
            await win.setFocus();
            return;
        }
        const win = await this.ensure();
        await this.moveWindow(this.position.x, this.position.y);
        await emit('mic:prepare-recording', {reason});
        await win.show();
        await win.setFocus();
        this.visible = true;
        await emit('mic:start-fade-in', {reason});
        await emit('mic:visibility-change', {visible: true, reason});
        await this.scheduleAutoStart(reason);
    }

    async hide(reason: string = 'system'): Promise<void> {
        if (!this.visible) {
            return;
        }
        this.visible = false;
        await emit('mic:start-fade-out', {reason});
        if (this.window) {
            try {
                await this.window.hide();
            } catch {
                this.window = null;
            }
        }
        await emit('mic:visibility-change', {visible: false, reason});
    }

    async toggle(reason: string = 'manual'): Promise<void> {
        if (this.visible) {
            await this.hide(reason);
        } else {
            await this.show(reason);
        }
    }

    async setInteractive(interactive: boolean): Promise<void> {
        const win = this.window ?? (await WebviewWindow.getByLabel('mic'));
        if (!win) {
            return;
        }
        try {
            await win.setIgnoreCursorEvents(!interactive);
        } catch {
            /* ignore */
        }
    }

    async beginDrag(): Promise<void> {
        const win = await this.ensure();
        await win.startDragging();
    }

    private async ensureInitialPosition(): Promise<void> {
        if (this.positionLoaded) {
            return;
        }
        this.positionLoaded = true;
        try {
            const config = await configApi.get();
            if (config.micWindowPosition) {
                this.position = config.micWindowPosition;
            }
        } catch {
            /* ignore */
        }
    }

    private async attachMoveListener(win: WebviewWindow): Promise<void> {
        if (this.moveUnlisten) {
            return;
        }
        try {
            this.moveUnlisten = await win.onMoved(({payload}) => {
                if (!payload) {
                    return;
                }
                const x = Math.round(payload.x);
                const y = Math.round(payload.y);
                this.position = {x, y};
                void configApi.update({micWindowPosition: {x, y}});
            });
        } catch {
            /* ignore */
        }
    }

    private async scheduleAutoStart(reason: string): Promise<void> {
        if (reason !== 'shortcut' && reason !== 'taskbar') {
            return;
        }
        try {
            const config = await configApi.get();
            if (!config.micAutoStartRecording) {
                return;
            }
            setTimeout(() => {
                void emit('mic:start-recording', {reason});
            }, 120);
        } catch {
            /* ignore */
        }
    }
}

const micController = new MicWindowController();

const actionHotkeysApi = {
    register: (hotkeys: Array<{id: string; accelerator: string}>) =>
        invoke('action_hotkeys_register', {hotkeys}),
    clear: () => invoke('action_hotkeys_clear')
};

const localSpeechApi = {
    getStatus: (): Promise<FastWhisperStatus> => invoke('local_speech_get_status'),
    install: (): Promise<FastWhisperStatus> => invoke('local_speech_install'),
    start: (): Promise<FastWhisperStatus> => invoke('local_speech_start'),
    restart: (): Promise<FastWhisperStatus> => invoke('local_speech_restart'),
    reinstall: (): Promise<FastWhisperStatus> => invoke('local_speech_reinstall'),
    stop: (): Promise<FastWhisperStatus> => invoke('local_speech_stop'),
    onStatus: (callback: (status: FastWhisperStatus) => void) => {
        const unlistenPromise = listen<FastWhisperStatus>('local-speech:status', (event) =>
            callback(event.payload)
        );
        return () => {
            unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
        };
    }
};

const eventListeners = new Map<string, UnlistenFn>();

const eventsApi = {
    on: (channel: string, callback: (...args: any[]) => void) => {
        const key = `${channel}:${callback.toString()}`;
        const unlistenPromise = listen(channel, (event) => callback(event.payload));
        unlistenPromise.then((unlisten) => {
            eventListeners.set(key, unlisten);
        });
        return () => {
            unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
            eventListeners.delete(key);
        };
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
        const key = `${channel}:${callback.toString()}`;
        const handler = eventListeners.get(key);
        if (handler) {
            handler();
            eventListeners.delete(key);
        }
    }
};

window.winky = {
    config: configApi,
    resources: resourcesApi,
    clipboard: clipboardApi,
    auth: authApi,
    actions: actionsApi,
    icons: iconsApi,
    profile: profileApi,
    speech: speechApi,
    llm: llmApi,
    result: resultApi,
    windows: windowsApi,
    notifications: notificationsApi,
    windowControls: windowControlsApi,
    mic: {
        moveWindow: (x: number, y: number) => micController.moveWindow(x, y),
        moveBy: (dx: number, dy: number) => micController.moveBy(dx, dy),
        setInteractive: (interactive: boolean) => micController.setInteractive(interactive),
        getPosition: () => micController.getPosition(),
        getCursorPosition: () => micController.getCursorPosition(),
        setAnchor: (anchor: MicAnchor) => micController.setAnchor(anchor),
        show: (reason?: string) => micController.show(reason),
        hide: (reason?: string) => micController.hide(reason),
        toggle: (reason?: string) => micController.toggle(reason),
        beginDrag: () => micController.beginDrag()
    },
    actionHotkeys: actionHotkeysApi,
    localSpeech: localSpeechApi,
    on: eventsApi.on,
    removeListener: eventsApi.removeListener
} as any;

void listen('mic:show-request', (event) => {
    const reason = (event.payload as any)?.reason ?? 'system';
    void micController.show(reason);
});

void listen('mic:hide-request', (event) => {
    const reason = (event.payload as any)?.reason ?? 'system';
    void micController.hide(reason);
});

void listen('mic:toggle-request', (event) => {
    const reason = (event.payload as any)?.reason ?? 'system';
    void micController.toggle(reason);
});

void listen('mic:shortcut', () => {
    void micController.toggle('shortcut');
});

void listen('tray:open-main', async () => {
    if (currentWindowKind !== 'main') {
        return;
    }
    try {
        await currentWindow.show();
        await currentWindow.setFocus();
    } catch {
        // ignore
    }
    void emit('navigate-to', '/actions');
});
