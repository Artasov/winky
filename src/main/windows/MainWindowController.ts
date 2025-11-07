import {BrowserWindow, Menu} from 'electron';
import type {WindowController} from './WindowController';
import type {ConfigRepository} from '../services/config/ConfigRepository';
import {APP_NAME} from '@shared/constants';

type MainWindowDeps = {
    isDev: boolean;
    preloadPath: string;
    rendererPath: string;
    getIconPath: () => string;
    configRepository: ConfigRepository;
};

export class MainWindowController implements WindowController {
    readonly id = 'main';
    private window: BrowserWindow | null = null;

    constructor(private readonly deps: MainWindowDeps) {}

    getWindow(): BrowserWindow | null {
        return this.window;
    }

    ensureWindow(): BrowserWindow {
        if (this.window && !this.window.isDestroyed()) {
            return this.window;
        }

        this.window = new BrowserWindow({
            width: 960,
            height: 640,
            minWidth: 960,
            minHeight: 640,
            title: APP_NAME,
            icon: this.deps.getIconPath(),
            frame: false,
            show: false,
            titleBarStyle: 'hidden',
            transparent: false,
            backgroundColor: '#020617',
            webPreferences: {
                preload: this.deps.preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
                devTools: this.deps.isDev,
                sandbox: false,
                webSecurity: false
            }
        });

        Menu.setApplicationMenu(null);
        this.window.setMenuBarVisibility(false);

        if (this.deps.isDev) {
            void this.window.loadURL('http://localhost:5173');
        } else {
            void this.window.loadFile(this.deps.rendererPath);
        }

        this.window.on('closed', () => {
            this.window = null;
        });

        return this.window;
    }

    async show(route?: string): Promise<void> {
        const targetRoute = await this.resolveRoute(route);
        const win = this.ensureWindow();

        const sendRoute = () => {
            if (targetRoute) {
                win.webContents.send('navigate-to', targetRoute);
            }
        };

        if (win.isVisible()) {
            win.show();
            win.focus();
            sendRoute();
            return;
        }

        if (!win.webContents.isLoading()) {
            win.show();
            win.focus();
            if (targetRoute) {
                setTimeout(sendRoute, 100);
            }
            return;
        }

        win.once('ready-to-show', () => {
            win.show();
            win.focus();
            if (targetRoute) {
                setTimeout(sendRoute, 100);
            }
        });
    }

    destroy(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
        this.window = null;
    }

    private async resolveRoute(route?: string): Promise<string> {
        if (route) {
            return route;
        }
        try {
            const config = await this.deps.configRepository.get();
            const hasToken = config.auth.access || config.auth.accessToken;
            if (!hasToken) {
                return '/';
            }
            if (!config.setupCompleted) {
                return '/setup';
            }
            return '/actions';
        } catch {
            return '/';
        }
    }
}
