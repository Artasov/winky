import {app, BrowserWindow} from 'electron';
import path from 'path';
import {destroyTray} from './tray';
import {registerIpcHandlers} from './ipc/registerIpcHandlers';
import {registerAuthIpc, registerAuthProtocol, handleAuthUrl, notifyAuthPayloads} from './app/oauth';
import {handleAppReady} from './app/appLifecycle';
import {MainWindowController} from './windows/MainWindowController';
import {MicWindowController, type MicVisibilityReason} from './windows/MicWindowController';
import {ResultWindowController} from './windows/ResultWindowController';
import {ErrorWindowController} from './windows/ErrorWindowController';
import {WindowRegistry} from './windows/WindowRegistry';
import {emitToAllWindows} from './windows/emitToAllWindows';
import {HotkeyManager} from './hotkeys/HotkeyManager';
import {ConfigRepository} from './services/config/ConfigRepository';
import {getConfig} from './config';
import {sendLogToRenderer} from './utils/logger';

const isDev = process.env.NODE_ENV === 'development';

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-transparent-visuals');
    app.disableHardwareAcceleration();
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
    app.quit();
}

const preloadPath = path.resolve(__dirname, 'preload.js');
const rendererPath = path.resolve(__dirname, '../renderer/index.html');

const getIconPath = (): string => {
    if (isDev) {
        return path.resolve(__dirname, '../../public/resources/logo-rounded.png');
    }
    return path.join(process.resourcesPath, 'resources', 'logo-rounded.png');
};

const configRepository = new ConfigRepository();
const windowRegistry = new WindowRegistry();

const mainWindowController = windowRegistry.register(new MainWindowController({
    isDev,
    preloadPath,
    rendererPath,
    getIconPath,
    configRepository
}));

const micWindowController = windowRegistry.register(new MicWindowController({
    isDev,
    preloadPath,
    rendererPath,
    sendLog: sendLogToRenderer,
    configRepository
}));

const resultWindowController = windowRegistry.register(new ResultWindowController({
    isDev,
    preloadPath,
    rendererPath,
    getIconPath
}));

const errorWindowController = windowRegistry.register(new ErrorWindowController({
    isDev,
    preloadPath,
    rendererPath
}));

const hotkeyManager = new HotkeyManager(emitToAllWindows);

const showMicWindowInstance = (reason: MicVisibilityReason = 'system') => micWindowController.show(reason);
const hideMicWindow = (reason: MicVisibilityReason = 'system', options: { disableAutoShow?: boolean } = {}) => micWindowController.hide(reason, options);
const toggleMicWindow = async (reason: MicVisibilityReason = 'manual') => micWindowController.toggle(reason);
const setMicInteractive = (interactive: boolean) => micWindowController.setInteractive(interactive);
const moveMicWindow = (x: number, y: number) => micWindowController.moveTo(x, y);
const moveMicWindowBy = (dx: number, dy: number) => micWindowController.moveBy(dx, dy);
const ensureMicWindowReady = async (): Promise<BrowserWindow | null> => micWindowController.ensureWindow();
const createMicWindow = (): Promise<BrowserWindow | null> => micWindowController.ensureWindow();
const createResultWindow = (): BrowserWindow | null => resultWindowController.ensureWindow();
const createOrShowErrorWindow = (payload: { title: string; message: string; details?: string }) => errorWindowController.show(payload);
const showMainWindow = async (route?: string) => mainWindowController.show(route);

const registerMicShortcut = async (): Promise<void> => {
    const config = await getConfig();
    const accelerator = (config.micHotkey || '').trim();

    if (!accelerator) {
        hotkeyManager.clearMicShortcut();
        return;
    }

    const result = hotkeyManager.registerMicShortcut(accelerator, () => {
        void toggleMicWindow('shortcut');
    });

    if (result !== 'success') {
        console.warn(`[Hotkey] Failed to register shortcut ${accelerator}: ${result}`);
    }
};

registerIpcHandlers({
    isDev,
    registerMicShortcut,
    showMainWindow,
    showMicWindowInstance,
    hideMicWindow,
    toggleMicWindow,
    moveMicWindow,
    moveMicWindowBy,
    setMicInteractive,
    ensureMicWindowReady,
    createMicWindow,
    createResultWindow,
    createOrShowErrorWindow,
    micWindowController,
    mainWindowController,
    resultWindowController
});

registerAuthIpc();
registerAuthProtocol();

app.whenReady().then(() => handleAppReady({
    isDev,
    getIconPath,
    registerMicShortcut,
    showMainWindow,
    ensureMicWindowReady,
    showMicWindowInstance,
    createMicWindow,
    micWindowController,
    mainWindowController
}));

app.on('open-url', (event, url) => {
    event.preventDefault();
    handleAuthUrl(url);
    notifyAuthPayloads(mainWindowController.getWindow() ?? null);
});

app.on('second-instance', (_event, argv) => {
    if (argv.includes('--show-mic')) {
        void ensureMicWindowReady().then(() => {
            showMicWindowInstance('taskbar');
        });
        return;
    }
    void showMainWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        destroyTray();
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindowController.ensureWindow();
    }
});

app.on('quit', () => {
    destroyTray();
});

app.on('will-quit', () => {
    hotkeyManager.unregisterAll();
});
