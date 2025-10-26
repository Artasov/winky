import {app, BrowserWindow, clipboard, ipcMain, Menu} from 'electron';
import path from 'path';
import axios from 'axios';
import {createTray, destroyTray} from './tray';
import {getConfig, getConfigFilePath, resetConfig, setActions, setAuthTokens, updateConfig} from './config';
import {ACTIONS_ENDPOINT, API_BASE_URL_FALLBACKS, APP_NAME, ICONS_ENDPOINT, PROFILE_ENDPOINT} from '@shared/constants';
import type {ActionConfig, ActionIcon, AppConfig, AuthResponse, AuthTokens, WinkyProfile} from '@shared/types';
import {createApiClient} from '@shared/api';
import {createSpeechService} from './services/speech/factory';
import {createLLMService} from './services/llm/factory';
import FormData from 'form-data';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let resultWindow: BrowserWindow | null = null;

const preloadPath = path.resolve(__dirname, 'preload.js');
const rendererPath = path.resolve(__dirname, '../renderer/index.html');

// Путь к иконке приложения
const getIconPath = (): string => {
  if (isDev) {
    return path.resolve(__dirname, '../../public/brand/logo-rounded.png');
  }
  // В production иконка находится в dist/renderer (упакована в asar)
  return path.resolve(__dirname, '../renderer/brand/logo-rounded.png');
};

let micWindow: BrowserWindow | null = null;

const broadcastConfigUpdate = async () => {
    const config = await getConfig();
    BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
            win.webContents.send('config:updated', config);
        }
    });
};

const setMicInteractive = (interactive: boolean) => {
    if (!micWindow || micWindow.isDestroyed()) {
        return;
    }
    if (interactive) {
        // Окно полностью интерактивно
        micWindow.setIgnoreMouseEvents(false);
    } else {
        // Клики проходят сквозь с forward:true
        micWindow.setIgnoreMouseEvents(true, { forward: true });
    }
};

const moveMicWindow = (x: number, y: number) => {
    if (!micWindow || micWindow.isDestroyed()) {
        return;
    }
    // animate=false для мгновенного перемещения без анимации
    micWindow.setPosition(Math.round(x), Math.round(y), false);
};

const createMainWindow = () => {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 640,
        minWidth: 960,
        minHeight: 640,
        title: APP_NAME,
        icon: getIconPath(),
        frame: false,
        show: false,
        titleBarStyle: 'hidden',
        transparent: false,
        backgroundColor: '#020617',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            sandbox: false
        }
    });

    mainWindow.setMenuBarVisibility(false);

    const targetUrl = isDev ? 'http://localhost:5173' : rendererPath;
    if (isDev) {
        void mainWindow.loadURL(targetUrl);
    } else {
        void mainWindow.loadFile(targetUrl);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Главное окно не показываем автоматически, только по требованию (клик на трей и т.д.)
};

const createResultWindow = () => {
    if (resultWindow && !resultWindow.isDestroyed()) {
        resultWindow.focus();
        return resultWindow;
    }

    resultWindow = new BrowserWindow({
        width: 700,
        height: 600,
        minWidth: 500,
        minHeight: 400,
        resizable: true,
        icon: getIconPath(),
        frame: false,
        show: false,
        skipTaskbar: false,
        alwaysOnTop: true,
        backgroundColor: '#ffffff',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            sandbox: false
        }
    });

    resultWindow.setMenuBarVisibility(false);

    const resultUrl = isDev
        ? 'http://localhost:5173/?window=result#/result'
        : `file://${rendererPath}?window=result#result`;

    resultWindow.loadURL(resultUrl);

    resultWindow.on('closed', () => {
        resultWindow = null;
    });

    resultWindow.once('ready-to-show', () => {
        resultWindow?.show();
        if (isDev && resultWindow) {
            resultWindow.webContents.openDevTools({ mode: 'detach' });
        }
    });

    return resultWindow;
};

const createMicWindow = () => {
    if (micWindow) {
        return micWindow;
    }

    micWindow = new BrowserWindow({
        width: 160,
        height: 160,
        resizable: false,
        frame: false,
        transparent: true,
        show: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            sandbox: false
        }
    });

    micWindow.setMenuBarVisibility(false);
    // screen-saver - максимальный уровень, окно всегда поверх всех окон, даже полноэкранных
    micWindow.setAlwaysOnTop(true, 'screen-saver');
    micWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    micWindow.setFocusable(true);

    // Окно игнорирует клики, но forward:true позволяет элементам с pointer-events-auto получать события
    micWindow.setIgnoreMouseEvents(true, { forward: true });

    if (isDev) {
        void micWindow.loadURL('http://localhost:5173/?window=mic#/main');
    } else {
        void micWindow.loadFile(rendererPath, {hash: 'main', query: {window: 'mic'}});
    }

    micWindow.once('ready-to-show', () => {
        micWindow?.show();
        micWindow?.focus();
    });

    micWindow.on('closed', () => {
        micWindow = null;
    });

    // Дополнительная защита: если окно теряет статус alwaysOnTop, восстанавливаем его
    micWindow.on('blur', () => {
        if (micWindow && !micWindow.isDestroyed()) {
            micWindow.setAlwaysOnTop(true, 'screen-saver');
        }
    });

    return micWindow;
};

// Показываем главное окно (для трея и т.д.)
const showMainWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
    } else {
        createMainWindow();
        if (mainWindow) {
            mainWindow.once('ready-to-show', () => {
                mainWindow?.show();
                mainWindow?.focus();
            });
        }
    }
};

const registerIpcHandlers = () => {
    ipcMain.handle('config:get', async () => getConfig());

    ipcMain.handle('config:update', async (_event, partialConfig: Partial<AppConfig>) => {
        const updated = await updateConfig(partialConfig);
        await broadcastConfigUpdate();
        return updated;
    });

    ipcMain.handle('config:setAuth', async (_event, tokens: AuthTokens) => {
        const updated = await setAuthTokens(tokens);
        await broadcastConfigUpdate();
        return updated;
    });

    ipcMain.handle('config:reset', async () => {
        const reset = await resetConfig();
        await broadcastConfigUpdate();
        return reset;
    });

    ipcMain.handle('config:path', async () => getConfigFilePath());

    ipcMain.handle('clipboard:write', (_event, text: string) => {
        clipboard.writeText(text ?? '');
        return true;
    });

    ipcMain.handle('window:minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.handle('window:close', () => {
        mainWindow?.close();
    });

    // Удалён обработчик window:set-mode, так как режимы окна больше не используются

    ipcMain.handle('mic:move-window', (_event, x: number, y: number) => {
        moveMicWindow(x, y);
    });

    ipcMain.handle('mic:set-interactive', (_event, interactive: boolean) => {
        setMicInteractive(interactive);
    });

    ipcMain.handle('auth:login', async (_event, credentials: { email: string; password: string }) => {
        console.log('[auth:login] IPC received', {email: credentials.email});
        return login(credentials);
    });

    ipcMain.handle('windows:open-settings', () => {
        showMainWindow();
    });

    ipcMain.handle('actions:fetch', async () => fetchActions());
    ipcMain.handle('actions:create', async (_event, action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }) => createAction(action));
    ipcMain.handle('actions:update', async (_event, actionId: string, action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }) => updateAction(actionId, action));
    ipcMain.handle('actions:delete', async (_event, actionId: string) => deleteAction(actionId));
    ipcMain.handle('icons:fetch', async () => fetchIcons());
    ipcMain.handle('profile:fetch', async () => fetchProfile());
    ipcMain.handle('speech:transcribe', async (_event, audioData: ArrayBuffer, config: { mode: string; model: string; openaiKey?: string; googleKey?: string }) => transcribeAudio(audioData, config));
    ipcMain.handle('llm:process', async (_event, text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }) => processLLM(text, prompt, config));
    ipcMain.handle('llm:process-stream', async (_event, text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }) => processLLMStream(text, prompt, config));
    
    ipcMain.handle('result:open', async () => {
        const win = createResultWindow();
        // Ждем пока окно полностью загрузится
        if (win && !win.webContents.isLoading()) {
            return;
        }
        if (win) {
            await new Promise<void>((resolve) => {
                win.webContents.once('did-finish-load', () => {
                    // Даем еще немного времени на инициализацию React
                    setTimeout(() => resolve(), 100);
                });
            });
        }
    });
    ipcMain.handle('result:close', () => {
        console.log('[main] result:close invoked');
        if (resultWindow && !resultWindow.isDestroyed()) {
            console.log('[main] Closing result window');
            resultWindow.close();
        } else {
            console.log('[main] Result window already closed or not exists');
        }
    });
    ipcMain.handle('result:update', (_event, data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }) => {
        if (resultWindow && !resultWindow.isDestroyed()) {
            resultWindow.webContents.send('result:data', data);
        }
    });
};

const login = async ({email, password}: { email: string; password: string }) => {
    console.log('[auth:login] starting login attempts', {email, endpoints: API_BASE_URL_FALLBACKS.length});
    let data: AuthResponse | undefined;
    let lastError: unknown = null;

    for (const baseUrl of API_BASE_URL_FALLBACKS) {
        const endpoint = `${baseUrl.replace(/\/$/, '')}/auth/login/`;
        try {
            console.log('[auth:login] attempt', endpoint);
            ({data} = await axios.post<AuthResponse>(endpoint, {
                email,
                password
            }));
            console.log('[auth:login] POST success', endpoint);
            break;
        } catch (error: any) {
            lastError = error;
            console.error('[auth:login] POST failed', {
                endpoint,
                message: error?.message,
                code: error?.code,
                status: error?.response?.status,
                data: error?.response?.data
            });
        }
    }

    if (!data) {
        console.error('[auth:login] all endpoints failed');
        throw lastError ?? new Error('Не удалось выполнить запрос авторизации');
    }
    const tokens: AuthTokens = {
        accessToken: data.access,
        refreshToken: data.refresh
    };
    const config = await setAuthTokens(tokens);
    console.log('[auth:login] tokens stored, returning to renderer');
    return {tokens, user: data.user, config};
};

interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

const sendLogToRenderer = (type: string, data: any) => {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('api-log', { type, data });
        }
    });
};

const fetchActions = async (): Promise<ActionConfig[]> => {
    console.debug('[main] actions:fetch invoked');
    const config = await getConfig();
    if (!config.auth.accessToken) {
        console.debug('[main] actions:fetch skipped (no access token)');
        return config.actions;
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.get<PaginatedResponse<ActionConfig>>('/winky/actions/');
    const actions = data.results || [];
    console.debug('[main] actions:fetch success', {count: actions.length});
    await setActions(actions);
    await broadcastConfigUpdate();
    return actions;
};

const createAction = async (action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]> => {
    console.debug('[main] actions:create invoked', {name: action.name});
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.post<ActionConfig>('/winky/actions/', action);
    const updated = [...config.actions.filter(({id}) => id !== data.id), data];
    await setActions(updated);
    console.debug('[main] actions:create success', {actionId: data.id});
    await broadcastConfigUpdate();
    return updated;
};

const updateAction = async (actionId: string, action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]> => {
    console.debug('[main] actions:update invoked', {actionId, name: action.name});
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.patch<ActionConfig>(`/winky/actions/${actionId}/`, action);
    const updated = config.actions.map((a) => (a.id === actionId ? data : a));
    await setActions(updated);
    console.debug('[main] actions:update success', {actionId});
    await broadcastConfigUpdate();
    return updated;
};

const deleteAction = async (actionId: string): Promise<ActionConfig[]> => {
    console.debug('[main] actions:delete invoked', {actionId});
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    await client.delete(`/winky/actions/${actionId}/`);
    const updated = config.actions.filter(({id}) => id !== actionId);
    await setActions(updated);
    console.debug('[main] actions:delete success', {actionId});
    await broadcastConfigUpdate();
    return updated;
};

const fetchIcons = async (): Promise<ActionIcon[]> => {
    console.debug('[main] icons:fetch invoked');
    const config = await getConfig();
    if (!config.auth.accessToken) {
        console.error('[main] icons:fetch - нет токена авторизации');
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    console.debug('[main] icons:fetch - запрос к /winky/icons/');
    const {data} = await client.get<PaginatedResponse<ActionIcon>>('/winky/icons/');
    const icons = data.results || [];
    console.debug('[main] icons:fetch success', {count: icons.length, icons});
    return icons;
};

const fetchProfile = async (): Promise<WinkyProfile> => {
    console.debug('[main] profile:fetch invoked');
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.get<WinkyProfile>('/winky/profile/');
    console.debug('[main] profile:fetch success', {profileId: data.id});
    return data;
};

const transcribeAudio = async (audioData: ArrayBuffer, config: { mode: string; model: string; openaiKey?: string; googleKey?: string }): Promise<string> => {
    console.debug('[main] speech:transcribe invoked', { mode: config.mode, model: config.model, size: audioData.byteLength });
    
    // Для API-based сервисов делаем запрос напрямую из main process
    if (config.mode === 'api') {
        const buffer = Buffer.from(audioData);
        const formData = new FormData();
        formData.append('file', buffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        formData.append('model', config.model);
        
        const headers = {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${config.openaiKey}`
        };
        
        try {
            const { data } = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, { headers });
            console.debug('[main] speech:transcribe success', { textLength: data.text?.length });
            return data.text || '';
        } catch (error: any) {
            console.error('[main] speech:transcribe error', error.response?.data || error.message);
            throw new Error('Не удалось распознать речь: ' + (error.response?.data?.error?.message || error.message));
        }
    }
    
    // Для локальных моделей - пока не реализовано
    throw new Error('Local speech recognition not implemented yet');
};

const processLLM = async (text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string> => {
    console.debug('[main] llm:process invoked', { mode: config.mode, model: config.model, textLength: text.length });
    
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });
    
    const result = await service.process(text, prompt);
    console.debug('[main] llm:process success', { resultLength: result.length });
    return result;
};

const processLLMStream = async (text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string> => {
    console.debug('[main] llm:process-stream invoked', { mode: config.mode, model: config.model, textLength: text.length });
    
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });
    
    // Для стриминга нужно вернуть через другой механизм, пока используем обычный process
    const result = await service.process(text, prompt);
    console.debug('[main] llm:process-stream success', { resultLength: result.length });
    return result;
};

const handleAppReady = async () => {
    app.setName(APP_NAME);
    Menu.setApplicationMenu(null);
    
    // Создаём главное окно
    createMainWindow();
    
    // Создаём mic окно сразу
    createMicWindow();
    
    // Создаём трей
    createTray(showMainWindow);
    
    registerIpcHandlers();

    if (isDev && mainWindow) {
        mainWindow.webContents.openDevTools({mode: 'detach'});
    }
    
    if (isDev && micWindow) {
        micWindow.webContents.openDevTools({mode: 'detach'});
    }

    try {
        await fetchActions();
    } catch (error) {
        console.warn('Не удалось загрузить действия при запуске', error);
    }
};

app.whenReady().then(handleAppReady);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        destroyTray();
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

app.on('quit', () => {
    destroyTray();
});
