import {app, Menu} from 'electron';
import {APP_NAME} from '@shared/constants';
import {getConfig} from '../config';
import {createTray} from '../tray';
import type {MicVisibilityReason} from '../windows/MicWindowController';
import {extractDeepLinksFromArgv, handleAuthUrl, notifyAuthPayloads} from './oauth';
import {fetchActions, fetchCurrentUser} from '../services/api';
import {setCurrentUserCache, getCurrentUserCache} from '../state/currentUser';
import {sendLogToRenderer} from '../utils/logger';

type AppLifecycleDeps = {
    isDev: boolean;
    getIconPath: () => string;
    registerMicShortcut: () => Promise<void>;
    showMainWindow: (route?: string) => Promise<void>;
    ensureMicWindowReady: () => Promise<Electron.BrowserWindow | null>;
    showMicWindowInstance: (reason?: MicVisibilityReason) => void;
    createMicWindow: () => Promise<Electron.BrowserWindow | null>;
    micWindowController: any;
    mainWindowController: any;
};

export const handleAppReady = async (deps: AppLifecycleDeps): Promise<void> => {
    app.setName(APP_NAME);
    Menu.setApplicationMenu(null);

    const initialDeepLinks = extractDeepLinksFromArgv(process.argv);
    for (const link of initialDeepLinks) {
        handleAuthUrl(link);
    }

    deps.mainWindowController.ensureWindow();

    let shouldShowMainWindow = true;

    try {
        const config = await getConfig();
        const hasToken = config.auth.access || config.auth.accessToken;
        if (hasToken && (typeof hasToken === 'string' && hasToken.trim() !== '')) {
            try {
                const user = await fetchCurrentUser();
                setCurrentUserCache(user);
                sendLogToRenderer('APP_READY', `✅ User loaded: ${user?.email}`);
            } catch (error) {
                setCurrentUserCache(null);
                sendLogToRenderer('APP_READY', `⚠️ Failed to load user on startup: ${error}`);
            }

            const shouldAutoShowMic = config.setupCompleted;
            const micWindowInstance = deps.micWindowController.getWindow();
            if (!micWindowInstance || micWindowInstance.isDestroyed()) {
                void deps.createMicWindow().then(() => {
                    const win = deps.micWindowController.getWindow();
                    if (deps.isDev && win) {
                        win.webContents.openDevTools({mode: 'detach'});
                    }
                    if (shouldAutoShowMic && win && !win.isDestroyed()) {
                        deps.showMicWindowInstance('auto');
                    }
                }).catch((error) => {
                    sendLogToRenderer('APP_READY', `❌ Failed to create mic window: ${error}`);
                });
            } else if (shouldAutoShowMic) {
                deps.showMicWindowInstance('auto');
            }

            if (config.setupCompleted) {
                shouldShowMainWindow = false;
            }
        }
    } catch (error) {
        sendLogToRenderer('APP_READY', `❌ Error checking auth: ${error}`);
    }

    if (shouldShowMainWindow) {
        const mainWin = deps.mainWindowController.ensureWindow();
        mainWin.once('ready-to-show', () => {
            mainWin?.show();
            mainWin?.focus();
        });
    }

    createTray(
        deps.showMainWindow,
        undefined,
        () => {
            void deps.ensureMicWindowReady().then(() => {
                deps.showMicWindowInstance('taskbar');
            });
        }
    );

    if (process.platform === 'win32') {
        app.setUserTasks([
            {
                program: process.execPath,
                arguments: '--show-mic',
                iconPath: deps.getIconPath(),
                iconIndex: 0,
                title: 'Mic',
                description: 'Show the microphone overlay'
            }
        ]);
    }

    if (process.argv.includes('--show-mic')) {
        void deps.ensureMicWindowReady().then(() => {
            deps.showMicWindowInstance('taskbar');
        });
    }

    await deps.registerMicShortcut();

    const mainWindow = deps.mainWindowController.getWindow();
    if (mainWindow) {
        mainWindow.webContents.on('did-finish-load', () => {
            notifyAuthPayloads(mainWindow);
        });
    }

    if (deps.isDev && shouldShowMainWindow && mainWindow) {
        mainWindow.webContents.openDevTools({mode: 'detach'});
    }

    const cachedUser = getCurrentUserCache();
    if (cachedUser) {
        try {
            await fetchActions();
        } catch (error) {
            console.warn('[APP_READY] Failed to preload actions', error);
        }
    }
};
