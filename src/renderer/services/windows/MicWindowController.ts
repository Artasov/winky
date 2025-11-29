import {invoke} from '@tauri-apps/api/core';
import {cursorPosition, LogicalPosition} from '@tauri-apps/api/window';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {emit, UnlistenFn} from '@tauri-apps/api/event';
import type {AppConfig, MicAnchor} from '@shared/types';

type MicWindowConfigApi = {
    get: () => Promise<AppConfig>;
    update: (payload: Partial<AppConfig>) => Promise<AppConfig>;
};

type MicWindowControllerDeps = {
    configApi: MicWindowConfigApi;
    micWindowWidth: number;
    micWindowHeight: number;
    micWindowMargin: number;
};

export class MicWindowController {
    private window: WebviewWindow | null = null;
    private position: {x: number; y: number};
    private moveUnlisten: UnlistenFn | null = null;
    private positionLoaded = false;
    private visible = false;
    private micReady = false;
    private toggleInProgress = false;
    private hideInProgress = false;
    private autoStartConfig: {enabled: boolean; lastCheck: number} = {enabled: false, lastCheck: 0};
    private pendingAutoStart = false;
    private pendingAutoStartReason: string | null = null;
    private readonly AUTO_START_CONFIG_CACHE_MS = 5000;
    private readonly width: number;
    private readonly height: number;
    private readonly margin: number;
    private readonly configApi: MicWindowConfigApi;

    constructor({configApi, micWindowWidth, micWindowHeight, micWindowMargin}: MicWindowControllerDeps) {
        this.configApi = configApi;
        this.width = micWindowWidth;
        this.height = micWindowHeight;
        this.margin = micWindowMargin;
        this.position = {x: this.margin, y: this.margin};
    }

    /**
     * Предзагрузка скрытого окна микрофона, чтобы первая активация не мигала пустым окном.
     */
    async warmup(): Promise<void> {
        try {
            await this.ensure();
        } catch (error) {
            console.warn('[MicWindowController] warmup failed:', error);
        }
    }

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
        const positionPromise = this.ensureInitialPosition();

        if (this.window) {
            await positionPromise;
            return this.window;
        }

        const existing = await WebviewWindow.getByLabel('mic').catch(() => null);
        if (existing) {
            this.window = existing;
            await Promise.all([
                positionPromise,
                this.attachMoveListener(existing),
                this.syncIgnoreCursorEvents(existing, true)
            ]);
            return existing;
        }

        const win = new WebviewWindow('mic', {
            url: this.buildUrl(),
            title: 'Winky Mic',
            width: this.width,
            height: this.height,
            resizable: false,
            alwaysOnTop: true,
            visible: false,
            transparent: true,
            decorations: false,
            skipTaskbar: true,
            shadow: false,
            x: this.position.x,
            y: this.position.y
        } as any);

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

        const setPositionPromise = win.setPosition(new LogicalPosition(this.position.x, this.position.y)).catch(() => {});

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
        const currentPos = await win.position().catch(() => null);
        if (currentPos && currentPos.x === x && currentPos.y === y) {
            return;
        }
        this.position = {x, y};
        await win.setPosition(new LogicalPosition(x, y));
        await this.configApi.update({micWindowPosition: {x, y}});
    }

    async moveBy(dx: number, dy: number): Promise<void> {
        const current = await this.getPosition();
        await this.moveWindow(current.x + dx, current.y + dy);
    }

    async setAnchor(anchor: MicAnchor): Promise<{x: number; y: number}> {
        const width = window.screen?.availWidth ?? this.width + this.margin * 2;
        const height = window.screen?.availHeight ?? this.height + this.margin * 2;
        let x: number;
        let y: number;
        switch (anchor) {
            case 'top-right':
                x = width - this.width - this.margin;
                y = this.margin;
                break;
            case 'bottom-left':
                x = this.margin;
                y = height - this.height - this.margin;
                break;
            case 'bottom-right':
                x = width - this.width - this.margin;
                y = height - this.height - this.margin;
                break;
            default:
                x = this.margin;
                y = this.margin;
        }
        await this.moveWindow(x, y);
        await this.configApi.update({micAnchor: anchor});
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
        // Если идет процесс закрытия, ждем его завершения
        if (this.hideInProgress) {
            // Ждем завершения закрытия перед открытием
            let attempts = 0;
            while (this.hideInProgress && attempts < 50) {
                await new Promise((resolve) => setTimeout(resolve, 10));
                attempts += 1;
            }
        }

        if (this.window) {
            const exists = await WebviewWindow.getByLabel('mic').catch(() => null);
            if (!exists) {
                this.window = null;
            }
        }

        const win = await this.ensure();

        const isVisible = await win.isVisible().catch(() => false);
        this.visible = isVisible;

        if (isVisible) {
            try {
                await win.setFocus();
                return;
            } catch {
                /* ignore */
            }
        }

        try {
            const currentPos = await win.position().catch(() => null);
            if (currentPos) {
                this.position = {x: currentPos.x, y: currentPos.y};
            }
        } catch {
            /* ignore */
        }

        const positionPromise = this.moveWindow(this.position.x, this.position.y).catch(() => {});
        const preparePromise = emit('mic:prepare-recording', {reason});

        await Promise.all([positionPromise, preparePromise]);

        try {
            await Promise.all([win.show(), win.setFocus()]);
        } catch {
            try {
                await win.show();
                await win.setFocus();
            } catch {
                /* ignore */
            }
        }

        this.visible = true;
        await Promise.all([
            this.syncIgnoreCursorEvents(win, true),
            emit('mic:start-fade-in', {reason}),
            emit('mic:visibility-change', {visible: true, reason}),
            emit('mic:reset-interactive', {})
        ]);

        void this.scheduleAutoStart(reason);
    }

    async hide(reason: string = 'system'): Promise<void> {
        // Защита от повторных вызовов hide
        if (this.hideInProgress) {
            return;
        }
        this.hideInProgress = true;

        try {
            const win = this.window ?? (await WebviewWindow.getByLabel('mic').catch(() => null));
            if (!win) {
                this.visible = false;
                this.micReady = false;
                this.pendingAutoStart = false;
                this.pendingAutoStartReason = null;
                this.hideInProgress = false;
                return;
            }

            const isVisible = await win.isVisible().catch(() => false);
            this.visible = isVisible;

            if (!isVisible) {
                this.hideInProgress = false;
                return;
            }

            try {
                const currentPos = await win.position().catch(() => null);
                if (currentPos) {
                    this.position = {x: currentPos.x, y: currentPos.y};
                    void this.configApi.update({micWindowPosition: this.position});
                }
            } catch {
                /* ignore */
            }

            this.visible = false;
            // Сбрасываем состояние готовности и автозапуска при закрытии
            this.micReady = false;
            this.pendingAutoStart = false;
            this.pendingAutoStartReason = null;

            await Promise.all([
                emit('mic:start-fade-out', {reason}),
                win.hide().catch(() => {
                    this.window = null;
                }),
                emit('mic:visibility-change', {visible: false, reason})
            ]);
        } finally {
            this.hideInProgress = false;
        }
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

            const isVisible = await win.isVisible().catch(() => false);
            this.visible = isVisible;

            if (isVisible) {
                await this.hide(reason);
            } else {
                await this.show(reason);
            }
        } finally {
            this.toggleInProgress = false;
        }
    }

    async setInteractive(interactive: boolean): Promise<void> {
        const win = this.window ?? (await WebviewWindow.getByLabel('mic').catch(() => null));
        if (!win) {
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
            const config = await this.configApi.get();
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
                if (this.position.x !== x || this.position.y !== y) {
                    this.position = {x, y};
                    void this.configApi.update({micWindowPosition: {x, y}});
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

        const now = Date.now();
        if (now - this.autoStartConfig.lastCheck > this.AUTO_START_CONFIG_CACHE_MS) {
            try {
                const config = await this.configApi.get();
                this.autoStartConfig.enabled = config.micAutoStartRecording !== false;
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
        
        // Если окно уже готово, попробуем сразу запустить без ожиданий.
        if (this.micReady) {
            const started = await this.tryEmitStart(reason);
            if (started) {
                this.pendingAutoStart = false;
                this.pendingAutoStartReason = null;
                return;
            }
        }
        
        // Если micReady еще не установлен, ждем его установки (максимум 1 секунду)
        // Это важно для повторных открытий, когда micReady был сброшен при закрытии
        if (!this.micReady) {
            const maxWaitTime = 1000; // 1 секунда
            const checkInterval = 50; // проверяем каждые 50мс
            const startTime = Date.now();
            
            while (!this.micReady && (Date.now() - startTime) < maxWaitTime) {
                await new Promise((resolve) => setTimeout(resolve, checkInterval));
            }
            
            // После ожидания пробуем запустить, если micReady установлен
            if (this.micReady) {
                const started = await this.tryEmitStart(reason);
                if (started) {
                    this.pendingAutoStart = false;
                    this.pendingAutoStartReason = null;
                }
            }
        }
    }

    async handleMicReady(): Promise<void> {
        this.micReady = true;
        if (!this.pendingAutoStart || !this.autoStartConfig.enabled) {
            return;
        }
        const reason = this.pendingAutoStartReason ?? 'shortcut';
        const maxAttempts = 10;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const started = await this.tryEmitStart(reason);
            if (started) {
                this.pendingAutoStart = false;
                this.pendingAutoStartReason = null;
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }
}
