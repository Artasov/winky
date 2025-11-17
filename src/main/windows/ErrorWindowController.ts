import {BrowserWindow} from 'electron';
import type {WindowController} from './WindowController';

type ErrorWindowDeps = {
    isDev: boolean;
    preloadPath: string;
    rendererPath: string;
};

type ErrorPayload = {
    title: string;
    message: string;
    details?: string;
};

export class ErrorWindowController implements WindowController {
    readonly id = 'error';
    private window: BrowserWindow | null = null;

    constructor(private readonly deps: ErrorWindowDeps) {}

    getWindow(): BrowserWindow | null {
        return this.window;
    }

    show(data: ErrorPayload): BrowserWindow | null {
        const payload = {
            ...data,
            timestamp: new Date().toISOString()
        };

        if (this.window && !this.window.isDestroyed()) {
            this.window.focus();
            this.window.webContents.send('error:data', payload);
            return this.window;
        }

        this.window = new BrowserWindow({
            width: 520,
            height: 360,
            resizable: false,
            frame: false,
            show: false,
            backgroundColor: '#111827',
            webPreferences: {
                preload: this.deps.preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
                devTools: this.deps.isDev,
                sandbox: false,
                webSecurity: false
            }
        });

        this.window.webContents.setBackgroundThrottling(true);
        this.window.webContents.setFrameRate(0);

        if (this.deps.isDev) {
            void this.window.loadURL('http://localhost:5173/?window=error#/error');
        } else {
            void this.window.loadFile(this.deps.rendererPath, {hash: '/error', query: {window: 'error'}});
        }

        this.window.once('ready-to-show', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setBackgroundThrottling(false);
            }
            this.window?.show();
            this.window?.webContents.send('error:data', payload);
        });

        this.window.on('hide', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setBackgroundThrottling(true);
                this.window.webContents.setFrameRate(0);
            }
        });

        this.window.on('show', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setBackgroundThrottling(false);
                this.window.webContents.setFrameRate(60);
            }
        });

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

        return this.window;
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
}
