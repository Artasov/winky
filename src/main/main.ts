import {app, BrowserWindow, clipboard, ipcMain, Menu} from 'electron';
import path from 'path';
import axios from 'axios';
import {createTray, destroyTray} from './tray';
import {getConfig, getConfigFilePath, getStore, resetConfig, setActions, setAuthTokens, updateConfig} from './config';
import {ACTIONS_ENDPOINT, API_BASE_URL_FALLBACKS, APP_NAME, ICONS_ENDPOINT, ME_ENDPOINT, PROFILE_ENDPOINT} from '@shared/constants';
import type {ActionConfig, ActionIcon, AppConfig, AuthResponse, AuthTokens, User, WinkyProfile} from '@shared/types';
import {createApiClient} from '@shared/api';
import {createSpeechService} from './services/speech/factory';
import {createLLMService} from './services/llm/factory';
import FormData from 'form-data';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let resultWindow: BrowserWindow | null = null;
let errorWindow: BrowserWindow | null = null;

// Кеш текущего пользователя
let currentUser: User | null = null;

const preloadPath = path.resolve(__dirname, 'preload.js');
const rendererPath = path.resolve(__dirname, '../renderer/index.html');

// Путь к иконке приложения
const getIconPath = (): string => {
  if (isDev) {
    return path.resolve(__dirname, '../../public/resources/logo-rounded.png');
  }
  // В production иконка из extraResources
  return path.join(process.resourcesPath, 'resources', 'logo-rounded.png');
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
            sandbox: false,
            webSecurity: false // Разрешаем загрузку локальных ресурсов из asar
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
    
    // НЕ показываем окно автоматически - оно покажется либо из handleAppReady, либо из трея
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
            sandbox: false,
            webSecurity: false // Разрешаем загрузку локальных ресурсов из asar
        }
    });

    resultWindow.setMenuBarVisibility(false);

    if (isDev) {
        void resultWindow.loadURL('http://localhost:5173/?window=result#/result');
    } else {
        void resultWindow.loadFile(rendererPath, {hash: '/result', query: {window: 'result'}});
    }

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

const createMicWindow = async () => {
    if (micWindow) {
        return micWindow;
    }

    const config = await getStore();
    const savedPosition = config.get('micWindowPosition');

    micWindow = new BrowserWindow({
        width: 160,
        height: 160,
        x: savedPosition?.x,
        y: savedPosition?.y,
        resizable: false,
        frame: false,
        transparent: true,
        show: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        type: 'toolbar', // Окно-инструмент без вкладки на панели задач
        backgroundColor: '#00000000',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            sandbox: false,
            webSecurity: false // Разрешаем загрузку локальных ресурсов из asar
        }
    });

    micWindow.setMenuBarVisibility(false);
    micWindow.setSkipTaskbar(true); // Явно устанавливаем, чтобы окно не появлялось в панели задач
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
        if (micWindow && !micWindow.isDestroyed()) {
            micWindow.show();
            // НЕ вызываем focus() чтобы окно не появлялось на панели задач
            micWindow.setSkipTaskbar(true); // Еще раз явно после show()
        }
    });

    micWindow.on('closed', () => {
        micWindow = null;
    });

    // Сохраняем позицию окна при перемещении
    micWindow.on('move', async () => {
        if (micWindow && !micWindow.isDestroyed()) {
            const [x, y] = micWindow.getPosition();
            const config = await getStore();
            config.set('micWindowPosition', { x, y });
        }
    });

    // Дополнительная защита: если окно теряет статус alwaysOnTop, восстанавливаем его
    micWindow.on('blur', () => {
        if (micWindow && !micWindow.isDestroyed()) {
            micWindow.setAlwaysOnTop(true, 'screen-saver');
        }
    });

    return micWindow;
};

// Создание или обновление окна ошибок
const createOrShowErrorWindow = (errorData: {
    title: string;
    message: string;
    details?: string;
}) => {
    const fullErrorData = {
        ...errorData,
        timestamp: new Date().toISOString()
    };

    // Если окно уже существует, обновляем его данные и показываем
    if (errorWindow && !errorWindow.isDestroyed()) {
        errorWindow.webContents.send('error:show', fullErrorData);
        if (!errorWindow.isVisible()) {
            errorWindow.show();
        }
        errorWindow.focus();
        return errorWindow;
    }

    // Создаем новое окно ошибки
    errorWindow = new BrowserWindow({
        width: 600,
        height: 500,
        resizable: true,
        frame: true,
        show: false,
        icon: getIconPath(),
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            sandbox: false,
            webSecurity: false
        }
    });

    errorWindow.setMenuBarVisibility(false);

    if (isDev) {
        void errorWindow.loadURL('http://localhost:5173/?window=error#/error');
    } else {
        void errorWindow.loadFile(rendererPath, { hash: '/error', query: { window: 'error' } });
    }

    errorWindow.once('ready-to-show', () => {
        if (errorWindow && !errorWindow.isDestroyed()) {
            // Отправляем данные ошибки после готовности окна
            errorWindow.webContents.send('error:show', fullErrorData);
            errorWindow.show();
            errorWindow.focus();
        }
    });

    errorWindow.on('closed', () => {
        errorWindow = null;
    });

    return errorWindow;
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
        
        // Создаём mic окно если setupCompleted был установлен в true
        if (updated.setupCompleted && updated.auth.accessToken && (!micWindow || micWindow.isDestroyed())) {
            void createMicWindow().then(() => {
                if (isDev && micWindow) {
                    micWindow.webContents.openDevTools({mode: 'detach'});
                }
            });
        }
        
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
        
        // Закрываем mic окно при выходе из аккаунта
        if (micWindow && !micWindow.isDestroyed()) {
            micWindow.close();
            micWindow = null;
        }
        
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
        try {
            return await login(credentials);
        } catch (error: any) {
            createOrShowErrorWindow({
                title: 'Authorization Error',
                message: error?.response?.data?.detail || error?.message || 'Failed to log in. Please check your credentials and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });

    ipcMain.handle('auth:logout', async () => {
        try {
            // Очищаем токены
            await setAuthTokens({ accessToken: '', refreshToken: '' });
            // Очищаем кеш пользователя
            currentUser = null;
            // Закрываем окно микрофона
            if (micWindow && !micWindow.isDestroyed()) {
                micWindow.close();
                micWindow = null;
            }
            await broadcastConfigUpdate();
            return true;
        } catch (error: any) {
            throw error;
        }
    });

    ipcMain.handle('windows:open-settings', () => {
        showMainWindow();
    });

    ipcMain.handle('actions:fetch', async () => {
        try {
            return await fetchActions();
        } catch (error: any) {
            createOrShowErrorWindow({
                title: 'Failed to Load Actions',
                message: error?.response?.data?.detail || error?.message || 'Could not load actions. Please check your connection and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });
    ipcMain.handle('actions:create', async (_event, action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }) => {
        try {
            return await createAction(action);
        } catch (error: any) {
            createOrShowErrorWindow({
                title: 'Failed to Create Action',
                message: error?.response?.data?.detail || error?.message || 'Could not create action. Please try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });
    ipcMain.handle('actions:update', async (_event, actionId: string, action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }) => {
        try {
            return await updateAction(actionId, action);
        } catch (error: any) {
            createOrShowErrorWindow({
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
            createOrShowErrorWindow({
                title: 'Failed to Delete Action',
                message: error?.response?.data?.detail || error?.message || 'Could not delete action. Please try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });
    ipcMain.handle('icons:fetch', async () => {
        try {
            return await fetchIcons();
        } catch (error: any) {
            createOrShowErrorWindow({
                title: 'Failed to Load Icons',
                message: error?.response?.data?.detail || error?.message || 'Could not load icons. Please check your connection and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });
    ipcMain.handle('profile:fetch', async () => {
        try {
            return await fetchProfile();
        } catch (error: any) {
            createOrShowErrorWindow({
                title: 'Failed to Load Profile',
                message: error?.response?.data?.detail || error?.message || 'Could not load profile. Please check your connection and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });
    
    ipcMain.handle('user:fetch', async () => {
        try {
            return await fetchCurrentUser();
        } catch (error: any) {
            // Не показываем окно ошибки для 401/403, это означает что нужна авторизация
            if (error?.response?.status === 401 || error?.response?.status === 403) {
                // Очищаем токен если получили 401/403
                await setAuthTokens({ accessToken: '', refreshToken: '' });
                currentUser = null;
                await broadcastConfigUpdate();
                return null;
            }
            createOrShowErrorWindow({
                title: 'Failed to Load User',
                message: error?.response?.data?.detail || error?.message || 'Could not load user data. Please check your connection and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            throw error;
        }
    });
    
    ipcMain.handle('user:get-cached', async () => {
        return currentUser;
    });
    
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
        if (resultWindow && !resultWindow.isDestroyed()) {
            resultWindow.close();
        }
    });
    ipcMain.handle('result:update', (_event, data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }) => {
        if (resultWindow && !resultWindow.isDestroyed()) {
            resultWindow.webContents.send('result:data', data);
        }
    });
};

const login = async ({email, password}: { email: string; password: string }) => {
    let data: AuthResponse | undefined;
    let lastError: unknown = null;

    for (const baseUrl of API_BASE_URL_FALLBACKS) {
        const endpoint = `${baseUrl.replace(/\/$/, '')}/auth/login/`;
        try {
            ({data} = await axios.post<AuthResponse>(endpoint, {
                email,
                password
            }));
            break;
        } catch (error: any) {
            lastError = error;
        }
    }

    if (!data) {
        throw lastError ?? new Error('Не удалось выполнить запрос авторизации');
    }
    const tokens: AuthTokens = {
        accessToken: data.access,
        refreshToken: data.refresh
    };
    const config = await setAuthTokens(tokens);
    
    // Создаём mic окно только если уже пройдена первичная настройка
    if (config.setupCompleted && (!micWindow || micWindow.isDestroyed())) {
        void createMicWindow().then(() => {
            if (isDev && micWindow) {
                micWindow.webContents.openDevTools({mode: 'detach'});
            }
        });
    }
    
    // Загружаем текущего пользователя после успешной авторизации
    try {
        currentUser = await fetchCurrentUser();
    } catch (error) {
        // Игнорируем ошибку, пользователь будет загружен при следующем запросе
    }
    
    return {tokens, user: data.user, config};
};

const fetchCurrentUser = async (): Promise<User | null> => {
    const config = await getConfig();
    
    if (!config.auth.accessToken) {
        currentUser = null;
        return null;
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    
    try {
        const { data } = await client.get<User>(ME_ENDPOINT);
        currentUser = data;
        return data;
    } catch (error: any) {
        currentUser = null;
        throw error;
    }
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
    const config = await getConfig();
    if (!config.auth.accessToken) {
        return config.actions;
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.get<PaginatedResponse<ActionConfig>>('/winky/actions/');
    const actions = data.results || [];
    await setActions(actions);
    await broadcastConfigUpdate();
    return actions;
};

const createAction = async (action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]> => {
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.post<ActionConfig>('/winky/actions/', action);
    const updated = [...config.actions.filter(({id}) => id !== data.id), data];
    await setActions(updated);
    await broadcastConfigUpdate();
    return updated;
};

const updateAction = async (actionId: string, action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]> => {
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.patch<ActionConfig>(`/winky/actions/${actionId}/`, action);
    const updated = config.actions.map((a) => (a.id === actionId ? data : a));
    await setActions(updated);
    await broadcastConfigUpdate();
    return updated;
};

const deleteAction = async (actionId: string): Promise<ActionConfig[]> => {
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    await client.delete(`/winky/actions/${actionId}/`);
    const updated = config.actions.filter(({id}) => id !== actionId);
    await setActions(updated);
    await broadcastConfigUpdate();
    return updated;
};

const fetchIcons = async (): Promise<ActionIcon[]> => {
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.get<PaginatedResponse<ActionIcon>>('/winky/icons/');
    const icons = data.results || [];
    return icons;
};

const fetchProfile = async (): Promise<WinkyProfile> => {
    const config = await getConfig();
    if (!config.auth.accessToken) {
        throw new Error('Необходимо авторизоваться.');
    }

    const client = createApiClient(config.auth.accessToken, sendLogToRenderer);
    const {data} = await client.get<WinkyProfile>('/winky/profile/');
    return data;
};

const transcribeAudio = async (audioData: ArrayBuffer, config: { mode: string; model: string; openaiKey?: string; googleKey?: string }): Promise<string> => {
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
            return data.text || '';
        } catch (error: any) {
            throw new Error('Не удалось распознать речь: ' + (error.response?.data?.error?.message || error.message));
        }
    }
    
    // Для локальных моделей - пока не реализовано
    throw new Error('Local speech recognition not implemented yet');
};

const processLLM = async (text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string> => {
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });
    
    return await service.process(text, prompt);
};

const processLLMStream = async (text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string> => {
    const service = createLLMService(config.mode as any, config.model as any, {
        openaiKey: config.openaiKey,
        googleKey: config.googleKey,
        accessToken: config.accessToken
    });
    
    // Для стриминга нужно вернуть через другой механизм, пока используем обычный process
    return await service.process(text, prompt);
};

const handleAppReady = async () => {
    app.setName(APP_NAME);
    Menu.setApplicationMenu(null);
    
    // Создаём главное окно (но не показываем его пока)
    createMainWindow();
    
    // Проверяем авторизацию и первичную настройку
    let shouldShowMainWindow = true;
    try {
        const config = await getConfig();
        if (config.auth.accessToken && config.auth.accessToken.trim() !== '') {
            // Есть токен, проверяем его валидность через запрос текущего пользователя
            try {
                const user = await fetchCurrentUser();
                
                if (user && config.setupCompleted) {
                    // Пользователь успешно загружен и setup пройден - показываем только микрофон
                    shouldShowMainWindow = false;
                    void createMicWindow().then(() => {
                        if (isDev && micWindow) {
                            micWindow.webContents.openDevTools({mode: 'detach'});
                        }
                    });
                } else if (!user) {
                    // Не удалось загрузить пользователя, токен невалиден
                    shouldShowMainWindow = true;
                }
            } catch (error) {
                shouldShowMainWindow = true;
            }
        }
    } catch (error) {
        // Ошибка при проверке авторизации, показываем главное окно
    }
    
    // Показываем главное окно только если пользователь не авторизован или setup не пройден
    if (shouldShowMainWindow && mainWindow) {
        mainWindow.once('ready-to-show', () => {
            mainWindow?.show();
            mainWindow?.focus();
        });
    }
    
    // Создаём трей
    createTray(showMainWindow);
    
    registerIpcHandlers();

    if (isDev && mainWindow && shouldShowMainWindow) {
        mainWindow.webContents.openDevTools({mode: 'detach'});
    }

    // Загружаем actions только если пользователь авторизован
    if (currentUser) {
        try {
            await fetchActions();
        } catch (error) {
            // Игнорируем ошибку, actions будут загружены позже
        }
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
