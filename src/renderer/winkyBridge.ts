import {invoke} from '@tauri-apps/api/core';
import {cursorPosition, getCurrentWindow, LogicalPosition} from '@tauri-apps/api/window';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {listen, emit, EventCallback, UnlistenFn} from '@tauri-apps/api/event';
import {writeText as writeClipboardText} from '@tauri-apps/plugin-clipboard-manager';
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
    const maybeWindow = currentWindow as unknown as {openDevtools?: () => Promise<void>};
    if (maybeWindow?.openDevtools) {
        try {
            await maybeWindow.openDevtools();
            return;
        } catch {
            // ignore and fallback
        }
    }

    try {
        await invoke('window_open_devtools');
    } catch {
        // Игнорируем ошибки
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
        const payload = text ?? '';
        try {
            await writeClipboardText(payload);
            return true;
        } catch {
            // ignore and fallback to navigator api
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(payload);
                return true;
            }
        } catch {
            // ignore
        }
        return false;
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
        const existing = await WebviewWindow.getByLabel(this.label).catch(() => null);
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
    private toggleInProgress = false;

    private async syncIgnoreCursorEvents(win: WebviewWindow, ignore: boolean, requireVisible = false): Promise<void> {
        let appliedNative = false;
        try {
            await win.setIgnoreCursorEvents(ignore);
            appliedNative = true;
        } catch (tauriError) {
            console.debug('[MicWindowController] Failed to toggle ignore cursor events via window API:', tauriError);
        }

        if (requireVisible) {
            const isVisible = await win.isVisible().catch(() => false);
            if (!isVisible) {
                return;
            }
        }

        try {
            await invoke('window_set_ignore_cursor_events', {
                label: 'mic',
                ignore,
                // Передаем флаг, чтобы бэкенд мог пропустить повторное применение
                skip_native: appliedNative
            });
        } catch (invokeError) {
            console.debug('[MicWindowController] Failed to sync ignore cursor events via command:', invokeError);
        }
    }

    private buildUrl(): string {
        const base = window.location.href.split('#')[0].split('?')[0];
        const params = new URLSearchParams({window: 'mic'});
        const url = `${base}?${params.toString()}#/mic`;
        console.log('[MicWindowController] buildUrl:', url);
        return url;
    }

    private async ensure(): Promise<WebviewWindow> {
        console.log('[MicWindowController] ensure() called');
        await this.ensureInitialPosition();
        if (this.window) {
            console.log('[MicWindowController] window already exists, returning');
            return this.window;
        }
        console.log('[MicWindowController] checking for existing window...');
        // Пробуем получить существующее окно, но не выбрасываем ошибку если его нет
        const existing = await WebviewWindow.getByLabel('mic').catch(() => null);
        if (existing) {
            console.log('[MicWindowController] found existing window');
            this.window = existing;
            await this.attachMoveListener(existing);
            
            // Синхронизируем состояние видимости с реальным состоянием окна
            try {
                const isVisible = await existing.isVisible().catch(() => false);
                this.visible = isVisible;
            } catch {
                // Игнорируем ошибки
            }
            
            // Гарантируем неинтерактивное состояние на Windows через оба механизма
            await this.syncIgnoreCursorEvents(existing, true);
            
            return existing;
        }
        console.log('[MicWindowController] creating new window...');
        const win = new WebviewWindow('mic', {
            url: this.buildUrl(),
            title: 'Winky Mic',
            width: MIC_WINDOW_WIDTH,
            height: MIC_WINDOW_HEIGHT,
            resizable: false,
            alwaysOnTop: true,
            visible: false, // Создаем скрытым
            transparent: true,
            decorations: false,
            skipTaskbar: true,
            shadow: false
        } as any);
        
        // Ждем чтобы окно зарегистрировалось в Tauri backend и контент начал загружаться
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('[MicWindowController] window created, skipping ready check');
        // Убираем проверку готовности - она блокирует создание окна
        // Окно зарегистрируется асинхронно
        
        void win.once('tauri://destroyed', () => {
            this.window = null;
            if (this.moveUnlisten) {
                this.moveUnlisten();
                this.moveUnlisten = null;
            }
            this.visible = false;
        });
        this.window = win;
        console.log('[MicWindowController] attaching move listener...');
        await this.attachMoveListener(win);
        
        console.log('[MicWindowController] window created and ready');
        // Отключаем тень на Windows после создания окна
        try {
            // @ts-ignore - может быть доступно в некоторых версиях Tauri
            if (win.setShadow) {
                await win.setShadow(false);
            }
        } catch {
            // Игнорируем если метод недоступен
        }
        
        // Устанавливаем неинтерактивное состояние сразу после создания
        await this.syncIgnoreCursorEvents(win, true);
        
        return win;
    }

    async moveWindow(x: number, y: number): Promise<void> {
        const win = await this.ensure();
        // Обновляем позицию только если она действительно изменилась
        const currentPos = await win.position().catch(() => null);
        if (currentPos && currentPos.x === x && currentPos.y === y) {
            return;
        }
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
        const scale = window.devicePixelRatio || 1;
        return {x: cursor.x / scale, y: cursor.y / scale};
    }

    async show(reason: string = 'system'): Promise<void> {
        console.log('[MicWindowController] show() called, reason:', reason);
        
        // Проверяем что окно действительно существует перед использованием
        if (this.window) {
            const exists = await WebviewWindow.getByLabel('mic').catch(() => null);
            if (!exists) {
                console.log('[MicWindowController] cached window not found, recreating...');
                this.window = null;
            }
        }
        
        const win = await this.ensure();
        console.log('[MicWindowController] window ensured:', !!win);
        // Проверяем реальное состояние окна
        const isCurrentlyVisible = await win.isVisible().catch(() => false);
        console.log('[MicWindowController] isCurrentlyVisible:', isCurrentlyVisible, 'this.visible:', this.visible);
        if (isCurrentlyVisible && this.visible) {
            await win.setFocus();
            console.log('[MicWindowController] window already visible, focused');
            return;
        }
        // Получаем текущую позицию окна перед показом
        try {
            const currentPos = await win.position();
            if (currentPos) {
                // Сохраняем текущую позицию если окно уже было видимо
                this.position = {x: currentPos.x, y: currentPos.y};
            } else {
                // Устанавливаем позицию только если окно еще не было видимо
                try {
                    await this.moveWindow(this.position.x, this.position.y);
                } catch {
                    // Игнорируем ошибки позиционирования
                }
            }
        } catch {
            // Если не удалось получить позицию, просто устанавливаем позицию
            try {
                await this.moveWindow(this.position.x, this.position.y);
            } catch {
                // Игнорируем ошибки позиционирования
            }
        }
        await emit('mic:prepare-recording', {reason});
        
        // Если окно показывается впервые, добавляем небольшую задержку для загрузки контента
        const isFirstShow = !this.visible;
        if (isFirstShow) {
            console.log('[MicWindowController] First show, waiting for content to load...');
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        try {
            console.log('[MicWindowController] calling win.show()...');
            await win.show();
            console.log('[MicWindowController] win.show() succeeded');
            
            // Проверяем что окно действительно показалось
            const isNowVisible = await win.isVisible().catch(() => false);
            console.log('[MicWindowController] After show(), isVisible:', isNowVisible);
            
            // Проверяем позицию окна
            const pos = await win.position().catch(() => null);
            console.log('[MicWindowController] Window position:', pos);
            
            await win.setFocus();
            console.log('[MicWindowController] win.setFocus() succeeded');
        } catch (error) {
            console.error('[MicWindowController] Error showing window:', error);
            // Если окно еще не готово, пробуем через небольшую задержку
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
                await win.show();
                await win.setFocus();
                console.log('[MicWindowController] Retry succeeded');
            } catch (retryError) {
                console.error('[MicWindowController] Retry failed:', retryError);
                // Игнорируем ошибки - окно может быть уже показано или закрыто
            }
        }
        
        // Устанавливаем окно как неинтерактивное после показа, чтобы клики проходили сквозь прозрачные области
        // Интерактивность будет включаться автоматически через interactive.ts при наведении на элементы
        await this.syncIgnoreCursorEvents(win, true);
        
        this.visible = true;
        console.log('[MicWindowController] window shown, visible set to true');
        await emit('mic:start-fade-in', {reason});
        await emit('mic:visibility-change', {visible: true, reason});
        await this.scheduleAutoStart(reason);
        
        // Отправляем событие для сброса состояния интерактивности в renderer
        await emit('mic:reset-interactive', {});
        console.log('[MicWindowController] show() completed');
    }

    async hide(reason: string = 'system'): Promise<void> {
        const win = this.window ?? (await WebviewWindow.getByLabel('mic').catch(() => null));
        if (!win) {
            this.visible = false;
            return;
        }
        // Проверяем реальное состояние окна
        const isCurrentlyVisible = await win.isVisible().catch(() => false);
        if (!isCurrentlyVisible && !this.visible) {
            return;
        }
        this.visible = false;
        await emit('mic:start-fade-out', {reason});
        try {
            await win.hide();
        } catch {
            this.window = null;
        }
        await emit('mic:visibility-change', {visible: false, reason});
    }

    async toggle(reason: string = 'manual'): Promise<void> {
        // Защита от множественных вызовов
        if (this.toggleInProgress) {
            return;
        }
        this.toggleInProgress = true;
        
        try {
            // Проверяем реальное состояние окна, а не только this.visible
            const win = this.window ?? (await WebviewWindow.getByLabel('mic').catch(() => null));
            if (!win) {
                // Окно не существует, создаем и показываем
                await this.show(reason);
                return;
            }
            
            // Проверяем реальное состояние видимости окна
            const isVisible = await win.isVisible().catch(() => false);
            if (isVisible) {
                await this.hide(reason);
            } else {
                await this.show(reason);
            }
        } finally {
            // Сбрасываем флаг после небольшой задержки, чтобы предотвратить повторные вызовы
            setTimeout(() => {
                this.toggleInProgress = false;
            }, 100);
        }
    }

    async setInteractive(interactive: boolean): Promise<void> {
        const win = this.window ?? (await WebviewWindow.getByLabel('mic').catch(() => null));
        if (!win) {
            // Окно не найдено - это нормально если оно еще не создано или уже закрыто
            return;
        }
        const ignore = !interactive;
        await this.syncIgnoreCursorEvents(win, ignore, true);
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
    checkHealth: (): Promise<FastWhisperStatus> => invoke('local_speech_check_health'),
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

let micShortcutHandling = false;
void listen('mic:shortcut', () => {
    // Защита от множественных вызовов события
    if (micShortcutHandling) {
        return;
    }
    micShortcutHandling = true;
    void micController.toggle('shortcut').finally(() => {
        // Сбрасываем флаг после небольшой задержки
        setTimeout(() => {
            micShortcutHandling = false;
        }, 200);
    });
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
