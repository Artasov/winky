import {BrowserWindow, clipboard, ipcMain, screen} from 'electron';
import type {AppConfig, AuthTokens, MicAnchor} from '@shared/types';
import {getConfig, getConfigFilePath, resetConfig, setAuthTokens, updateConfig} from '../config';
import {broadcastConfigUpdate} from '../services/configSync';
import {
    createAction,
    deleteAction,
    fetchActions,
    fetchIcons,
    fetchProfile,
    fetchCurrentUser,
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
import {setCurrentUserCache, getCurrentUserCache} from '../state/currentUser';
import {sendLogToRenderer} from '../utils/logger';

type IpcDependencies = {
    isDev: boolean;
    registerMicShortcut: () => Promise<void>;
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

export const registerIpcHandlers = (deps: IpcDependencies): void => {
    ipcMain.handle('config:get', async () => getConfig());

    ipcMain.handle('config:update', async (_event, partialConfig: Partial<AppConfig>) => {
        const updated = await updateConfig(partialConfig);
        await broadcastConfigUpdate();
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
                void deps.createMicWindow().then(() => {
                    const win = deps.micWindowController.getWindow();
                    if (deps.isDev && win) {
                        win.webContents.openDevTools({mode: 'detach'});
                    }
                    if (win) {
                        deps.showMicWindowInstance('auto');
                    }
                }).catch((error) => {
                    sendLogToRenderer('MIC_WINDOW', `❌ Failed to auto-show mic after config update: ${error}`);
                });
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
        await broadcastConfigUpdate();
        await deps.registerMicShortcut();

        const micInstance = deps.micWindowController.getWindow();
        if (micInstance && !micInstance.isDestroyed()) {
            micInstance.close();
        }

        return reset;
    });

    ipcMain.handle('config:path', async () => getConfigFilePath());

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
        setCurrentUserCache(null);
        const micInstance = deps.micWindowController.getWindow();
        if (micInstance && !micInstance.isDestroyed()) {
            micInstance.close();
        }
        await broadcastConfigUpdate();
        return true;
    });

    ipcMain.handle('windows:open-settings', async () => {
        await deps.showMainWindow();
    });

    ipcMain.handle('actions:fetch', async () => {
        try {
            return await fetchActions();
        } catch (error: any) {
            deps.createOrShowErrorWindow({
                title: 'Failed to Load Actions',
                message: error?.response?.data?.detail || error?.message || 'Could not load actions. Please check your connection and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });

    ipcMain.handle('actions:create', async (_event, action: ActionPayload) => {
        try {
            return await createAction(action);
        } catch (error: any) {
            deps.createOrShowErrorWindow({
                title: 'Failed to Create Action',
                message: error?.response?.data?.detail || error?.message || 'Could not create action. Please try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });

    ipcMain.handle('actions:update', async (_event, actionId: string, action: ActionPayload) => {
        try {
            return await updateAction(actionId, action);
        } catch (error: any) {
            deps.createOrShowErrorWindow({
                title: 'Failed to Update Action',
                message: error?.response?.data?.detail || error?.message || 'Could not update action. Please try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });

    ipcMain.handle('actions:delete', async (_event, actionId: string) => {
        try {
            return await deleteAction(actionId);
        } catch (error: any) {
            deps.createOrShowErrorWindow({
                title: 'Failed to Delete Action',
                message: error?.response?.data?.detail || error?.message || 'Could not delete action. Please try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });

    ipcMain.handle('icons:fetch', async () => fetchIcons());
    ipcMain.handle('profile:fetch', async () => fetchProfile());

    ipcMain.handle('user:fetch', async () => {
        try {
            const user = await fetchCurrentUser();
            setCurrentUserCache(user);
            return user;
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
                sendLogToRenderer('USER', '🔒 Auth required (401/403), clearing tokens');
                await setAuthTokens({access: '', refresh: null, accessToken: '', refreshToken: ''});
                setCurrentUserCache(null);
                await broadcastConfigUpdate();
                return null;
            }
            if (status >= 500) {
                sendLogToRenderer('USER', `⚠️ Server error (${status}), user data not available`);
                setCurrentUserCache(null);
                return null;
            }
            sendLogToRenderer('USER', `❌ User fetch failed with status ${status || 'unknown'}`);
            deps.createOrShowErrorWindow({
                title: 'Failed to Load User',
                message: error?.response?.data?.detail || error?.message || 'Could not load user data. Please check your connection and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            setCurrentUserCache(null);
            return null;
        }
    });

    ipcMain.handle('user:get-cached', async () => getCurrentUserCache());

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
};
