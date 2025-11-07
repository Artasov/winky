import axios from 'axios';
import type {BrowserWindow} from 'electron';
import {API_BASE_URL_FALLBACKS} from '@shared/constants';
import type {AuthResponse, AuthTokens} from '@shared/types';
import {setAuthTokens} from '../config';
import {fetchActions, fetchCurrentUser} from './api';
import {broadcastConfigUpdate} from './configSync';
import {sendLogToRenderer} from '../utils/logger';
import type {MicVisibilityReason, MicWindowController} from '../windows/MicWindowController';
import type {MainWindowController} from '../windows/MainWindowController';
import {setCurrentUserCache} from '../state/currentUser';

type LoginFlowDeps = {
    micWindowController: MicWindowController;
    mainWindowController: MainWindowController;
    createMicWindow: () => Promise<BrowserWindow | null>;
    showMicWindowInstance: (reason?: MicVisibilityReason) => void;
    isDev: boolean;
};

export const performLogin = async (
    deps: LoginFlowDeps,
    {email, password}: { email: string; password: string }
) => {
    let data: AuthResponse | undefined;
    let lastError: unknown = null;

    for (const baseUrl of API_BASE_URL_FALLBACKS) {
        const endpoint = `${baseUrl.replace(/\/$/, '')}/auth/login/`;
        try {
            ({data} = await axios.post<AuthResponse>(endpoint, {email, password}));
            break;
        } catch (error: any) {
            lastError = error;
        }
    }

    if (!data) {
        throw lastError ?? new Error('Не удалось выполнить запрос авторизации');
    }

    const tokens: AuthTokens = {
        access: data.access,
        refresh: data.refresh,
        accessToken: data.access,
        refreshToken: data.refresh
    };

    const config = await setAuthTokens(tokens);
    await broadcastConfigUpdate();

    try {
        const user = await fetchCurrentUser();
        setCurrentUserCache(user);
        sendLogToRenderer('LOGIN', `✅ User fetched successfully: ${user?.email || 'null'}`);
    } catch (error) {
        setCurrentUserCache(null);
        sendLogToRenderer('LOGIN', `⚠️ Failed to fetch user (will retry later): ${error}`);
    }

    try {
        const actions = await fetchActions();
        sendLogToRenderer('LOGIN', `🗂️ Actions synced (${actions.length})`);
    } catch (error) {
        sendLogToRenderer('LOGIN', `⚠️ Failed to sync actions after login: ${error}`);
    }

    const micWindow = deps.micWindowController.getWindow();
    sendLogToRenderer('LOGIN', `🔍 Check: setupCompleted=${config.setupCompleted}, micWindow exists=${Boolean(micWindow && !micWindow.isDestroyed())}`);

    if (!micWindow || micWindow.isDestroyed()) {
        sendLogToRenderer('LOGIN', '🎤 Creating mic window after login...');
        void deps.createMicWindow().then(() => {
            const created = deps.micWindowController.getWindow();
            if (deps.isDev && created) {
                created.webContents.openDevTools({mode: 'detach'});
            }
            if (config.setupCompleted && created && !created.isDestroyed()) {
                deps.showMicWindowInstance('auto');
            }
            const mainWin = deps.mainWindowController.getWindow();
            if (config.setupCompleted && mainWin && !mainWin.isDestroyed()) {
                sendLogToRenderer('LOGIN', '🔒 Closing main window after mic window created');
                mainWin.close();
            }
        }).catch((error) => sendLogToRenderer('LOGIN', `❌ Failed to create mic window: ${error}`));
    } else {
        sendLogToRenderer('LOGIN', '⏭️ Mic window already exists, skipping creation');
        if (config.setupCompleted && micWindow && !micWindow.isDestroyed()) {
            deps.showMicWindowInstance('auto');
        }
        const mainWin = deps.mainWindowController.getWindow();
        if (config.setupCompleted && mainWin && !mainWin.isDestroyed()) {
            mainWin.close();
        }
    }

    return {tokens, user: data.user, config};
};
