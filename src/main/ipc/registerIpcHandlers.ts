import {BrowserWindow, clipboard, ipcMain, screen} from 'electron';
import path from 'path';
import type {AppConfig, AuthTokens, MicAnchor} from '@shared/types';
import {getConfig, getConfigFilePath, resetConfig, setAuthTokens, updateConfig} from '../config';
import {broadcastConfigUpdate} from '../services/configSync';
import {syncAutoLaunchSetting} from '../services/autoLaunch';
import {ensureLocalSpeechAutoStart, shouldAutoStartLocalSpeech} from '../services/localSpeech/autoStart';
import {
    createAction,
    deleteAction,
    fetchActions,
    fetchIcons,
    fetchProfile,
    processLLM,
    processLLMStream,
    transcribeAudio,
    updateAction,
    type ActionPayload
} from '../services/api';
import type {MicWindowController, MicVisibilityReason} from '../windows/MicWindowController';
import type {MainWindowController} from '../windows/MainWindowController';
import type {ResultWindowController} from '../windows/ResultWindowController';
import {performLogin} from '../services/loginFlow';
import {sendLogToRenderer} from '../utils/logger';
import {fastWhisperManager} from '../services/localSpeech/FastWhisperManager';
import {emitToAllWindows} from '../windows/emitToAllWindows';

type IpcDependencies = {
    isDev: boolean;
    registerMicShortcut: () => Promise<void>;
    registerActionHotkeys: (hotkeys: Array<{ id: string; accelerator: string }>) => void;
    clearActionHotkeys: () => void;
    showMainWindow: (route?: string) => Promise<void>;
    showMicWindowInstance: (reason?: MicVisibilityReason) => void;
    hideMicWindow: (reason?: MicVisibilityReason, options?: {disableAutoShow?: boolean}) => void;
    toggleMicWindow: (reason?: MicVisibilityReason) => Promise<void>;
    moveMicWindow: (x: number, y: number) => void;
    moveMicWindowBy: (dx: number, dy: number) => void;
    setMicInteractive: (interactive: boolean) => void;
    ensureMicWindowReady: () => Promise<BrowserWindow | null>;
    createMicWindow: () => Promise<BrowserWindow | null>;
    createResultWindow: () => BrowserWindow | null;
    createOrShowErrorWindow: (payload: { title: string; message: string; details?: string }) => BrowserWindow | null;
    micWindowController: MicWindowController;
    mainWindowController: MainWindowController;
    resultWindowController: ResultWindowController;
};

const shouldShowErrorWindow = (error: any): boolean => {
    const status = error?.response?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
        return false;
    }
    return true;
};

const extractErrorMessage = (error: any, fallback: string): string =>
    error?.response?.data?.detail || error?.message || fallback;

export const registerIpcHandlers = (deps: IpcDependencies): void => {
    ipcMain.handle('config:get', async () => getConfig());

    ipcMain.handle('config:update', async (_event, partialConfig: Partial<AppConfig>) => {
        const prevConfig = await getConfig();
        const prevLocalSpeechAutoStart = shouldAutoStartLocalSpeech(prevConfig);
        let updated = await updateConfig(partialConfig);

        if (typeof partialConfig.launchOnSystemStartup === 'boolean') {
            try {
                await syncAutoLaunchSetting(Boolean(updated.launchOnSystemStartup));
            } catch (error) {
                sendLogToRenderer('AUTO_LAUNCH', `❌ Failed to update auto-launch setting: ${error}`);
                await updateConfig({launchOnSystemStartup: prevConfig.launchOnSystemStartup ?? false});
                updated = await getConfig();
                throw error;
            }
        }

        const nextLocalSpeechAutoStart = shouldAutoStartLocalSpeech(updated);
        if (!prevLocalSpeechAutoStart && nextLocalSpeechAutoStart) {
            void ensureLocalSpeechAutoStart(updated);
        }

        await broadcastConfigUpdate();
        deps.micWindowController.setMicAutoStart(Boolean(updated.micAutoStartRecording));
        await deps.registerMicShortcut();
        if (typeof partialConfig.micAnchor === 'string') {
            void deps.micWindowController.applyAnchor(partialConfig.micAnchor as MicAnchor, false);
        }

        // Создаём mic окно если setupCompleted был установлен в true
        const hasAuthToken = typeof updated.auth?.accessToken === 'string' && updated.auth.accessToken.trim().length > 0;
        const shouldAutoShowMic = hasAuthToken && updated.setupCompleted && updated.micShowOnLaunch !== false;

        if (shouldAutoShowMic) {
            const existingMicWindow = deps.micWindowController.getWindow();
            if (!existingMicWindow) {
                try {
                    await deps.createMicWindow();
                    const win = deps.micWindowController.getWindow();
                    if (deps.isDev && win) {
                        win.webContents.openDevTools({mode: 'detach'});
                    }
                    if (win) {
                        deps.showMicWindowInstance('auto');
                    }
                } catch (error) {
                    sendLogToRenderer('MIC_WINDOW', `❌ Failed to auto-show mic after config update: ${error}`);
                }
            } else if (partialConfig.setupCompleted === true) {
                deps.showMicWindowInstance('auto');
            }
        }

        return updated;
    });

    ipcMain.handle('config:setAuth', async (_event, tokens: AuthTokens) => {
        const updated = await setAuthTokens(tokens);
        await broadcastConfigUpdate();
        await deps.registerMicShortcut();
        return updated;
    });

    ipcMain.handle('config:reset', async () => {
        const reset = await resetConfig();
        try {
            await syncAutoLaunchSetting(Boolean(reset.launchOnSystemStartup));
        } catch (error) {
            sendLogToRenderer('AUTO_LAUNCH', `❌ Failed to sync auto-launch on reset: ${error}`);
            throw error;
        }
        await broadcastConfigUpdate();
        deps.micWindowController.setMicAutoStart(Boolean(reset.micAutoStartRecording));
        await deps.registerMicShortcut();

        const micInstance = deps.micWindowController.getWindow();
        if (micInstance && !micInstance.isDestroyed()) {
            micInstance.close();
        }

        return reset;
    });

    ipcMain.handle('config:path', async () => getConfigFilePath());

    ipcMain.handle('resources:sound-path', async (_event, soundName: string) => {
        const isDev = deps.isDev;
        if (isDev) {
            // В dev режиме файл обслуживается через Vite, используем относительный путь
            return `/sounds/${soundName}`;
        }
        // В production используем file:// протокол для файлов из extraResources
        const filePath = path.join(process.resourcesPath, 'sounds', soundName);
        return `file://${filePath.replace(/\\/g, '/')}`;
    });

    ipcMain.handle('clipboard:write', (_event, text: string) => {
        clipboard.writeText(text ?? '');
        return true;
    });

    ipcMain.handle('window:minimize', () => {
        deps.mainWindowController.getWindow()?.minimize();
    });

    ipcMain.handle('window:close', () => {
        deps.mainWindowController.getWindow()?.close();
    });

    ipcMain.handle('actions:hotkeys:register', (_event, hotkeys: Array<{ id: string; accelerator: string }>) => {
        deps.registerActionHotkeys(hotkeys ?? []);
        return true;
    });

    ipcMain.handle('actions:hotkeys:clear', () => {
        deps.clearActionHotkeys();
        return true;
    });

    ipcMain.handle('mic:move-window', (_event, x: number, y: number) => {
        deps.moveMicWindow(x, y);
    });

    ipcMain.handle('mic:move-by', (_event, dx: number, dy: number) => {
        deps.moveMicWindowBy(dx, dy);
    });

    ipcMain.handle('mic:set-interactive', (_event, interactive: boolean) => {
        deps.setMicInteractive(interactive);
    });

    ipcMain.handle('mic:get-position', () => {
        const win = deps.micWindowController.getWindow();
        if (!win || win.isDestroyed()) {
            return {x: 0, y: 0};
        }
        const [x, y] = win.getPosition();
        return {x, y};
    });

    ipcMain.handle('mic:get-cursor-position', () => {
        const point = screen.getCursorScreenPoint();
        return {x: point.x, y: point.y};
    });

    ipcMain.handle('mic:set-anchor', async (_event, anchor: MicAnchor) => {
        await deps.ensureMicWindowReady();
        const position = await deps.micWindowController.applyAnchor(anchor, true);
        return position;
    });

    ipcMain.handle('mic:begin-drag', () => {
        const win = deps.micWindowController.getWindow();
        if (!win || win.isDestroyed()) {
            return;
        }
        try {
            const anyWin = win as BrowserWindow & {beginMoveDrag?: () => void};
            if (typeof anyWin.beginMoveDrag === 'function') {
                anyWin.beginMoveDrag();
            }
        } catch (error) {
            sendLogToRenderer('MIC_WINDOW', {message: '[begin-drag] failed', error: String(error)});
        }
    });

    ipcMain.handle('mic:show', async (_event, reason?: MicVisibilityReason) => {
        await deps.ensureMicWindowReady();
        deps.showMicWindowInstance(reason ?? 'renderer');
        return true;
    });

    ipcMain.handle('mic:hide', async (_event, options?: { reason?: MicVisibilityReason; disableAutoShow?: boolean }) => {
        deps.hideMicWindow(options?.reason ?? 'renderer', {disableAutoShow: Boolean(options?.disableAutoShow)});
        return true;
    });

    ipcMain.handle('auth:login', async (_event, credentials: { email: string; password: string }) => {
        try {
            return await performLogin(
                {
                    micWindowController: deps.micWindowController,
                    mainWindowController: deps.mainWindowController,
                    createMicWindow: deps.createMicWindow,
                    showMicWindowInstance: deps.showMicWindowInstance,
                    isDev: deps.isDev
                },
                credentials
            );
        } catch (error: any) {
            deps.createOrShowErrorWindow({
                title: 'Authorization Error',
                message: error?.response?.data?.detail || error?.message || 'Failed to log in. Please check your credentials and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });

    ipcMain.handle('auth:logout', async () => {
        await setAuthTokens({access: '', refresh: null, accessToken: '', refreshToken: ''});
        const micInstance = deps.micWindowController.getWindow();
        if (micInstance && !micInstance.isDestroyed()) {
            micInstance.close();
        }
        await broadcastConfigUpdate();
        return true;
    });

    ipcMain.handle('windows:open-settings', async () => {
        await deps.showMainWindow('/settings');
        const forceRoute = () => {
            const win = deps.mainWindowController.getWindow();
            if (win && !win.isDestroyed()) {
                win.webContents.send('navigate-to', '/settings');
            }
        };
        forceRoute();
        setTimeout(forceRoute, 500);
        setTimeout(forceRoute, 1500);
    });

    ipcMain.handle('windows:navigate', async (_event, route: string) => {
        if (typeof route !== 'string' || route.trim().length === 0) {
            return;
        }
        emitToAllWindows('navigate-to', route);
    });

    ipcMain.handle('notifications:toast', async (_event, payload: {
        message?: string;
        type?: 'success' | 'info' | 'error';
        options?: { durationMs?: number };
    }) => {
        if (!payload?.message) {
            return;
        }
        emitToAllWindows('app:toast', {
            message: payload.message,
            type: payload.type ?? 'info',
            options: payload.options
        });
    });

    ipcMain.handle('actions:fetch', async () => {
        try {
            return await fetchActions();
        } catch (error: any) {
            const message = extractErrorMessage(error, 'Could not load actions. Please check your connection and try again.');
            if (shouldShowErrorWindow(error)) {
                deps.createOrShowErrorWindow({
                    title: 'Failed to Load Actions',
                    message,
                    details: JSON.stringify(error?.response?.data || error, null, 2)
                });
            }
            throw new Error(message);
        }
    });

    ipcMain.handle('actions:create', async (_event, action: ActionPayload) => {
        try {
            return await createAction(action);
        } catch (error: any) {
            const message = extractErrorMessage(error, 'Could not create action. Please try again.');
            if (shouldShowErrorWindow(error)) {
                deps.createOrShowErrorWindow({
                    title: 'Failed to Create Action',
                    message,
                    details: JSON.stringify(error?.response?.data || error, null, 2)
                });
            }
            throw new Error(message);
        }
    });

    ipcMain.handle('actions:update', async (_event, actionId: string, action: ActionPayload) => {
        try {
            return await updateAction(actionId, action);
        } catch (error: any) {
            const message = extractErrorMessage(error, 'Could not update action. Please try again.');
            if (shouldShowErrorWindow(error)) {
                deps.createOrShowErrorWindow({
                    title: 'Failed to Update Action',
                    message,
                    details: JSON.stringify(error?.response?.data || error, null, 2)
                });
            }
            throw new Error(message);
        }
    });

    ipcMain.handle('actions:delete', async (_event, actionId: string) => {
        try {
            return await deleteAction(actionId);
        } catch (error: any) {
            const message = extractErrorMessage(error, 'Could not delete action. Please try again.');
            if (shouldShowErrorWindow(error)) {
                deps.createOrShowErrorWindow({
                    title: 'Failed to Delete Action',
                    message,
                    details: JSON.stringify(error?.response?.data || error, null, 2)
                });
            }
            throw new Error(message);
        }
    });

    ipcMain.handle('icons:fetch', async () => fetchIcons());
    ipcMain.handle('profile:fetch', async () => fetchProfile());

    ipcMain.handle('speech:transcribe', async (_event, audioData: ArrayBuffer, config) =>
        transcribeAudio(audioData, config)
    );
    ipcMain.handle('llm:process', async (_event, text: string, prompt: string, config) =>
        processLLM(text, prompt, config)
    );
    ipcMain.handle('llm:process-stream', async (_event, text: string, prompt: string, config) =>
        processLLMStream(text, prompt, config)
    );

    ipcMain.handle('result:open', async () => {
        const win = deps.createResultWindow();
        if (win && !win.webContents.isLoading()) {
            return;
        }
        if (win) {
            await new Promise<void>((resolve) => {
                win.webContents.once('did-finish-load', () => {
                    setTimeout(() => resolve(), 100);
                });
            });
        }
    });

    ipcMain.handle('result:close', () => {
        const win = deps.resultWindowController.getWindow();
        if (win && !win.isDestroyed()) {
            win.close();
        }
    });

    ipcMain.handle('result:update', (_event, data) => {
        const win = deps.resultWindowController.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('result:data', data);
        }
    });

    ipcMain.handle('local-speech:get-status', async () => fastWhisperManager.getStatus());
    ipcMain.handle('local-speech:install', async () => fastWhisperManager.installAndStart());
    ipcMain.handle('local-speech:start', async () => fastWhisperManager.startExisting());
    ipcMain.handle('local-speech:restart', async () => fastWhisperManager.restart());
    ipcMain.handle('local-speech:reinstall', async () => fastWhisperManager.reinstall());
    ipcMain.handle('local-speech:stop', async () => fastWhisperManager.stop());
};
