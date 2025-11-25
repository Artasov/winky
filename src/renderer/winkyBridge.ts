import {invoke} from '@tauri-apps/api/core';
import {cursorPosition, getCurrentWindow, LogicalPosition} from '@tauri-apps/api/window';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {listen, emit, EventCallback, UnlistenFn} from '@tauri-apps/api/event';
import {writeText as writeClipboardText} from '@tauri-apps/plugin-clipboard-manager';
import {ResultWindowManager, type ResultPayload} from './services/windows/ResultWindowManager';
import {AuxWindowController} from './services/windows/AuxWindowController';
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

// ResultPayload экспортируется из ResultWindowManager

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

// Инициализируем менеджер окна результатов
const resultWindowManager = new ResultWindowManager();

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
        if (!payload) {
            console.warn('[clipboardApi] Empty text provided, skipping copy');
            return false;
        }
        
        // Сначала пробуем Tauri API
        try {
            await writeClipboardText(payload);
            return true;
        } catch (error) {
            console.debug('[clipboardApi] Tauri clipboard API failed, trying fallback:', error);
        }
        
        // Fallback на navigator.clipboard API
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(payload);
                return true;
            }
        } catch (error) {
            console.debug('[clipboardApi] Navigator clipboard API failed:', error);
        }
        
        // Последний fallback - старый способ через execCommand (для совместимости)
        try {
            if (typeof document !== 'undefined') {
                const textArea = document.createElement('textarea');
                textArea.value = payload;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) {
                    return true;
                }
            }
        } catch (error) {
            console.debug('[clipboardApi] execCommand fallback failed:', error);
        }
        
        console.error('[clipboardApi] All clipboard methods failed');
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

const errorWindow = new AuxWindowController('error', 'error', {
    width: 520,
    height: 360,
    decorations: false
});

// Используем новый менеджер для окна результатов
const resultApi = {
    open: () => resultWindowManager.open(),
    close: () => resultWindowManager.close(),
    update: (payload: ResultPayload) => resultWindowManager.update(payload),
    getState: () => resultWindowManager.getState(),
    onData: (callback: (payload: ResultPayload) => void) => resultWindowManager.onData(callback)
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
    private micReady = false;
    private toggleInProgress = false;
    private autoStartConfig: {enabled: boolean; lastCheck: number} = {enabled: false, lastCheck: 0};
    private pendingAutoStart = false;
    private pendingAutoStartReason: string | null = null;
    private readonly AUTO_START_CONFIG_CACHE_MS = 5000; // Кэшируем на 5 секунд

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
        return `${base}?${params.toString()}#/mic`;
    }

    private async ensure(): Promise<WebviewWindow> {
        // Загружаем позицию параллельно с проверкой окна
        const positionPromise = this.ensureInitialPosition();
        
        if (this.window) {
            await positionPromise;
            return this.window;
        }
        
        // Пробуем получить существующее окно
        const existing = await WebviewWindow.getByLabel('mic').catch(() => null);
        if (existing) {
            this.window = existing;
            // Синхронизируем состояние видимости
            try {
                const isVisible = await existing.isVisible().catch(() => false);
                this.visible = isVisible;
            } catch {
                // Игнорируем ошибки
            }
            // Параллельно выполняем операции
            await Promise.all([
                positionPromise,
                this.attachMoveListener(existing),
                this.syncIgnoreCursorEvents(existing, true)
            ]);
            return existing;
        }
        
        // Создаем новое окно с начальной позицией
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
            skipTaskbar: true,
            shadow: false,
            x: this.position.x,
            y: this.position.y,
        } as any);
        
        // Ждем создания окна
        await new Promise<void>((resolve, reject) => {
            win.once('tauri://created', () => resolve());
            win.once('tauri://error', ({payload}) => reject(payload));
        });
        
        void win.once('tauri://destroyed', () => {
            this.window = null;
            if (this.moveUnlisten) {
                this.moveUnlisten();
                this.moveUnlisten = null;
            }
            this.visible = false;
            this.micReady = false;
        });
        
        this.window = win;
        
        // Устанавливаем позицию явно после создания (на случай если x/y не сработали в конструкторе)
        const setPositionPromise = win.setPosition(new LogicalPosition(this.position.x, this.position.y)).catch(() => {});
        
        // Параллельно выполняем все операции инициализации
        await Promise.all([
            positionPromise,
            setPositionPromise,
            this.attachMoveListener(win),
            this.syncIgnoreCursorEvents(win, true)
        ]);
        
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
        // Проверяем кэш окна только если он есть
        if (this.window) {
            const exists = await WebviewWindow.getByLabel('mic').catch(() => null);
            if (!exists) {
                this.window = null;
            }
        }
        
        const win = await this.ensure();
        
        // Проверяем реальное состояние окна перед показом
        const isCurrentlyVisible = await win.isVisible().catch(() => false);
        if (isCurrentlyVisible) {
            // Окно уже видимо, просто фокусируем и обновляем состояние
            this.visible = true;
            try {
                await win.setFocus();
                return;
            } catch {
                // Игнорируем ошибки фокуса
            }
        }
        
        // Если окно скрыто, но this.visible еще true, сбрасываем состояние
        if (!isCurrentlyVisible && this.visible) {
            this.visible = false;
        }
        
        // Получаем реальную позицию окна перед установкой (если окно уже существует)
        try {
            const currentPos = await win.position().catch(() => null);
            if (currentPos) {
                // Используем реальную позицию окна, если она есть
                this.position = {x: currentPos.x, y: currentPos.y};
            }
        } catch {
            // Игнорируем ошибки
        }
        
        // Устанавливаем позицию параллельно с подготовкой
        const positionPromise = this.moveWindow(this.position.x, this.position.y).catch(() => {});
        const preparePromise = emit('mic:prepare-recording', {reason});
        
        await Promise.all([positionPromise, preparePromise]);
        
        // Показываем окно и фокусируем параллельно
        try {
            await Promise.all([
                win.show(),
                win.setFocus()
            ]);
        } catch (error) {
            // Если ошибка, пробуем еще раз без ожидания
            try {
                await win.show();
                await win.setFocus();
            } catch {
                // Игнорируем ошибки - окно может быть уже показано
            }
        }
        
        // Параллельно выполняем все операции после показа
        this.visible = true;
        await Promise.all([
            this.syncIgnoreCursorEvents(win, true),
            emit('mic:start-fade-in', {reason}),
            emit('mic:visibility-change', {visible: true, reason}),
            emit('mic:reset-interactive', {})
        ]);
        
        // Автозапуск выполняется асинхронно без блокировки
        void this.scheduleAutoStart(reason);
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
        
        // Сохраняем текущую позицию перед скрытием
        try {
            const currentPos = await win.position().catch(() => null);
            if (currentPos) {
                this.position = {x: currentPos.x, y: currentPos.y};
                // Сохраняем в конфиг асинхронно, не блокируя скрытие
                void configApi.update({micWindowPosition: this.position});
            }
        } catch {
            // Игнорируем ошибки получения позиции
        }
        
        // Устанавливаем состояние ДО скрытия, чтобы предотвратить повторные вызовы
        this.visible = false;
        
        // Параллельно скрываем окно и отправляем события
        await Promise.all([
            emit('mic:start-fade-out', {reason}),
            win.hide().catch(() => {
                this.window = null;
            }),
            emit('mic:visibility-change', {visible: false, reason})
        ]);
    }

    async toggle(reason: string = 'manual'): Promise<void> {
        if (this.toggleInProgress) {
            return;
        }
        this.toggleInProgress = true;
        
        try {
            const win = this.window ?? (await WebviewWindow.getByLabel('mic').catch(() => null));
            if (!win) {
                await this.show(reason);
                return;
            }
            
            // Проверяем реальное состояние окна для точности
            const isVisible = await win.isVisible().catch(() => false);
            
            if (isVisible) {
                await this.hide(reason);
            } else {
                await this.show(reason);
            }
        } finally {
            // Уменьшенная задержка
            setTimeout(() => {
                this.toggleInProgress = false;
            }, 50);
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
                // Округляем координаты для точности
                const x = Math.round(payload.x);
                const y = Math.round(payload.y);
                // Обновляем только если позиция действительно изменилась
                if (this.position.x !== x || this.position.y !== y) {
                    this.position = {x, y};
                    // Сохраняем в конфиг асинхронно
                    void configApi.update({micWindowPosition: {x, y}});
                }
            });
        } catch {
            /* ignore */
        }
    }

    private async tryEmitStart(reason: string): Promise<boolean> {
        const win = this.window ?? (await WebviewWindow.getByLabel('mic').catch(() => null));
        if (!win) {
            return false;
        }
        if (!this.micReady) {
            return false;
        }
        const isVisible = await win.isVisible().catch(() => false);
        if (!isVisible || !this.visible) {
            return false;
        }
        void emit('mic:start-recording', {reason});
        return true;
    }

    private async scheduleAutoStart(reason: string): Promise<void> {
        if (reason !== 'shortcut' && reason !== 'taskbar') {
            return;
        }

        // Используем кэшированную конфигурацию
        const now = Date.now();
        if (now - this.autoStartConfig.lastCheck > this.AUTO_START_CONFIG_CACHE_MS) {
            try {
                const config = await configApi.get();
                this.autoStartConfig.enabled = Boolean(config.micAutoStartRecording);
                this.autoStartConfig.lastCheck = now;
            } catch {
                this.autoStartConfig.enabled = false;
                return;
            }
        }
        
        if (!this.autoStartConfig.enabled) {
            return;
        }

        this.pendingAutoStart = true;
        this.pendingAutoStartReason = reason;

        // Уменьшенная задержка и несколько попыток, чтобы дождаться загрузки окна перед стартом записи
        setTimeout(async () => {
            const maxAttempts = 8;
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                const started = await this.tryEmitStart(reason);
                if (started) {
                    this.pendingAutoStart = false;
                    this.pendingAutoStartReason = null;
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 140 + attempt * 120));
            }
            // Оставляем флаг pending — при сигнале готовности окна сделаем ещё одну попытку
        }, 80);
    }

    async handleMicReady(): Promise<void> {
        this.micReady = true;
        if (!this.pendingAutoStart || !this.autoStartConfig.enabled) {
            return;
        }
        const reason = this.pendingAutoStartReason ?? 'shortcut';
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const started = await this.tryEmitStart(reason);
            if (started) {
                this.pendingAutoStart = false;
                this.pendingAutoStartReason = null;
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 120 + attempt * 80));
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
    install: (targetDir?: string): Promise<FastWhisperStatus> =>
        invoke('local_speech_install', {args: {targetDir}}),
    start: (): Promise<FastWhisperStatus> => invoke('local_speech_start'),
    restart: (): Promise<FastWhisperStatus> => invoke('local_speech_restart'),
    reinstall: (targetDir?: string): Promise<FastWhisperStatus> =>
        invoke('local_speech_reinstall', {args: {targetDir}}),
    stop: (): Promise<FastWhisperStatus> => invoke('local_speech_stop'),
    isModelDownloaded: (model: string): Promise<boolean> =>
        invoke('local_speech_check_model_downloaded', {model}),
    onStatus: (callback: (status: FastWhisperStatus) => void) => {
        const unlistenPromise = listen<FastWhisperStatus>('local-speech:status', (event) =>
            callback(event.payload)
        );
        return () => {
            unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
        };
    }
};

const ollamaApi = {
    checkInstalled: (): Promise<boolean> => invoke('ollama_check_installed'),
    listModels: (): Promise<string[]> => invoke('ollama_list_models'),
    pullModel: (model: string): Promise<void> => invoke('ollama_pull_model', {model}),
    warmupModel: (model: string): Promise<void> => invoke('ollama_warmup_model', {model})
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
    ollama: ollamaApi,
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

void listen('mic:ready', () => {
    void micController.handleMicReady();
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
