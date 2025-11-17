import {BrowserWindow} from 'electron';
import type {WindowController} from './WindowController';

type ResultWindowDeps = {
    isDev: boolean;
    preloadPath: string;
    rendererPath: string;
    getIconPath: () => string;
};

type ResultDataPayload = {
    transcription?: string;
    llmResponse?: string;
    isStreaming?: boolean;
};

export class ResultWindowController implements WindowController {
    readonly id = 'result';
    private window: BrowserWindow | null = null;

    constructor(private readonly deps: ResultWindowDeps) {}

    getWindow(): BrowserWindow | null {
        return this.window;
    }

    async open(): Promise<void> {
        const win = this.ensureWindow();
        if (!win) {
            return;
        }

        if (win.webContents.isLoading()) {
            await new Promise<void>((resolve) => {
                win.webContents.once('did-finish-load', () => setTimeout(resolve, 100));
            });
        }

        win.once('ready-to-show', () => {
            win.show();
            if (this.deps.isDev) {
                win.webContents.openDevTools({mode: 'detach'});
            }
        });
        win.show();
    }

    close(): void {
        if (this.window && !this.window.isDestroyed()) {
            try {
                this.window.webContents.setFrameRate(0);
                this.window.webContents.setBackgroundThrottling(true);
                this.window.webContents.executeJavaScript('window.stop()').catch(() => {});
                this.window.webContents.destroy();
            } catch {
                // Игнорируем ошибки при уничтожении
            }
            this.window.destroy();
        }
        this.window = null;
    }

    sendData(payload: ResultDataPayload): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('result:data', payload);
        }
    }

    destroy(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.setBackgroundThrottling(true);
            this.window.webContents.setFrameRate(0);
            this.window.webContents.executeJavaScript('window.stop()').catch(() => {});
            try {
                this.window.webContents.destroy();
            } catch {
                // Игнорируем ошибки при уничтожении
            }
            this.window.destroy();
        }
        this.window = null;
    }

    ensureWindow(): BrowserWindow {
        if (this.window && !this.window.isDestroyed()) {
            return this.window;
        }

        this.window = new BrowserWindow({
            width: 700,
            height: 600,
            minWidth: 500,
            minHeight: 400,
            resizable: true,
            icon: this.deps.getIconPath(),
            frame: false,
            show: false,
            skipTaskbar: false,
            alwaysOnTop: true,
            backgroundColor: '#ffffff',
            webPreferences: {
                preload: this.deps.preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
                devTools: this.deps.isDev,
                sandbox: false,
                webSecurity: false
            }
        });

        this.window.setMenuBarVisibility(false);
        this.window.webContents.setBackgroundThrottling(true);
        this.window.webContents.setFrameRate(0);

        if (this.deps.isDev) {
            void this.window.loadURL('http://localhost:5173/?window=result#/result');
        } else {
            void this.window.loadFile(this.deps.rendererPath, {hash: '/result', query: {window: 'result'}});
        }

        this.window.on('close', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setFrameRate(0);
                this.window.webContents.setBackgroundThrottling(true);
                this.window.webContents.executeJavaScript('window.stop()').catch(() => {});
            }
        });

        this.window.on('closed', () => {
            if (this.window && !this.window.isDestroyed()) {
                try {
                    this.window.webContents.destroy();
                } catch {
                    // Игнорируем ошибки при уничтожении
                }
            }
            this.window = null;
        });

        this.window.on('hide', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setBackgroundThrottling(true);
                this.window.webContents.setFrameRate(0);
                this.window.webContents.executeJavaScript(`
                    if (typeof document !== 'undefined') {
                        document.dispatchEvent(new Event('visibilitychange'));
                    }
                `).catch(() => {});
            }
        });

        this.window.on('show', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setBackgroundThrottling(false);
                this.window.webContents.setFrameRate(60);
            }
        });

        this.window.once('ready-to-show', () => {
            this.window?.show();
            if (this.deps.isDev && this.window) {
                this.window.webContents.openDevTools({mode: 'detach'});
            }
        });

        return this.window;
    }
}
