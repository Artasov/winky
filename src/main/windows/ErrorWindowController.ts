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

        if (this.deps.isDev) {
            void this.window.loadURL('http://localhost:5173/?window=error#/error');
        } else {
            void this.window.loadFile(this.deps.rendererPath, {hash: '/error', query: {window: 'error'}});
        }

        this.window.once('ready-to-show', () => {
            this.window?.show();
            this.window?.webContents.send('error:data', payload);
        });

        this.window.on('closed', () => {
            this.window = null;
        });

        return this.window;
    }

    destroy(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
        this.window = null;
    }
}
