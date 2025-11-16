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
            this.window.close();
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
            this.window.webContents.executeJavaScript('window.stop()').catch(() => {});
        }
        this.close();
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

        if (this.deps.isDev) {
            void this.window.loadURL('http://localhost:5173/?window=result#/result');
        } else {
            void this.window.loadFile(this.deps.rendererPath, {hash: '/result', query: {window: 'result'}});
        }

        this.window.on('closed', () => {
            this.window = null;
        });

        this.window.on('hide', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setBackgroundThrottling(true);
            }
        });

        this.window.on('show', () => {
            if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.setBackgroundThrottling(false);
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
