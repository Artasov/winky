import {app, BrowserWindow, BrowserWindowConstructorOptions, clipboard, ipcMain, Menu, screen} from 'electron';
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

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-transparent-visuals');
    app.disableHardwareAcceleration();
}

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

const ensureMicOnTop = () => {
    if (!micWindow || micWindow.isDestroyed()) {
        return;
    }
    const platform = process.platform;
    if (platform === 'darwin') {
        micWindow.setAlwaysOnTop(true, 'floating', 1);
    } else {
        micWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
    try {
        micWindow.moveTop();
    } catch (error) {
        // moveTop not supported everywhere
    }
};

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
        if (process.platform === 'darwin') {
            micWindow.setFocusable(true);
            micWindow.focus();
        }
        micWindow.setIgnoreMouseEvents(false);
        ensureMicOnTop();
        micWindow.flashFrame(false);
    } else {
        // Клики проходят сквозь с forward:true
        micWindow.setIgnoreMouseEvents(true, { forward: true });
        if (process.platform === 'darwin') {
            micWindow.setFocusable(false);
            micWindow.blur();
        }
        ensureMicOnTop();
    }
};

const moveMicWindow = (x: number, y: number) => {
    if (!micWindow || micWindow.isDestroyed()) {
        return;
    }
    // animate=false для мгновенного перемещения без анимации
    micWindow.setPosition(Math.round(x), Math.round(y), false);
    ensureMicOnTop();
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

/**
 * Проверяет и корректирует позицию окна, чтобы оно не выходило за границы экрана
 */
const ensureWindowWithinBounds = (
    savedPosition: { x: number; y: number } | undefined,
    windowWidth: number,
    windowHeight: number
): { x: number; y: number } | undefined => {
    if (!savedPosition) {
        return undefined;
    }

    const { x, y } = savedPosition;
    
    // Получаем дисплей, на котором должно быть окно
    const display = screen.getDisplayNearestPoint({ x, y });
    const { bounds } = display;
    
    // Минимальный отступ от края экрана (пиксели)
    const EDGE_MARGIN = 10;
    
    // Корректируем x координату
    let correctedX = x;
    if (x < bounds.x + EDGE_MARGIN) {
        // Окно за левым краем
        correctedX = bounds.x + EDGE_MARGIN;
    } else if (x + windowWidth > bounds.x + bounds.width - EDGE_MARGIN) {
        // Окно за правым краем
        correctedX = bounds.x + bounds.width - windowWidth - EDGE_MARGIN;
    }
    
    // Корректируем y координату
    let correctedY = y;
    if (y < bounds.y + EDGE_MARGIN) {
        // Окно за верхним краем
        correctedY = bounds.y + EDGE_MARGIN;
    } else if (y + windowHeight > bounds.y + bounds.height - EDGE_MARGIN) {
        // Окно за нижним краем
        correctedY = bounds.y + bounds.height - windowHeight - EDGE_MARGIN;
    }
    
    // Если позиция была скорректирована, логируем
    if (correctedX !== x || correctedY !== y) {
        sendLogToRenderer('MIC_WINDOW', `📐 Position corrected: (${x}, ${y}) → (${correctedX}, ${correctedY})`);
    }
    
    return { x: correctedX, y: correctedY };
};

const createMicWindow = async () => {
    if (micWindow) {
        return micWindow;
    }

    const config = await getStore();
    const savedPosition = config.get('micWindowPosition');
    
    const WINDOW_WIDTH = 160;
    const WINDOW_HEIGHT = 160;
    
    // Проверяем и корректируем позицию
    const safePosition = ensureWindowWithinBounds(savedPosition, WINDOW_WIDTH, WINDOW_HEIGHT);

    const isMac = process.platform === 'darwin';

    const windowOptions: BrowserWindowConstructorOptions = {
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        resizable: false,
        movable: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        show: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#00000000',
        type: isMac ? 'panel' : 'toolbar',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            sandbox: false,
            webSecurity: false // Разрешаем загрузку локальных ресурсов из asar
        }
    };

    if (safePosition) {
        windowOptions.x = safePosition.x;
        windowOptions.y = safePosition.y;
    } else {
        windowOptions.center = true;
    }

    if (isMac) {
        windowOptions.titleBarStyle = 'hidden';
    }

    micWindow = new BrowserWindow(windowOptions);

    micWindow.setMenuBarVisibility(false);
    micWindow.setHasShadow(false);
    micWindow.setSkipTaskbar(true);
    if (isMac) {
        micWindow.setAlwaysOnTop(true, 'floating', 1);
        micWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        micWindow.setFocusable(false);
    } else {
        micWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        micWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        micWindow.setFocusable(true);
    }
    ensureMicOnTop();

    micWindow.setIgnoreMouseEvents(true, { forward: true });

    if (isDev) {
        void micWindow.loadURL('http://localhost:5173/?window=mic#/mic');
    } else {
        void micWindow.loadFile(rendererPath, {hash: '/mic', query: {window: 'mic'}});
    }

    const showMicWindow = () => {
        if (!micWindow || micWindow.isDestroyed()) {
            return;
        }
        if (isMac) {
            micWindow.showInactive();
        } else {
            micWindow.show();
        }
        micWindow.setSkipTaskbar(true);
        ensureMicOnTop();
        micWindow.setIgnoreMouseEvents(true, { forward: true });
    };

    micWindow.once('ready-to-show', showMicWindow);
    micWindow.webContents.once('did-finish-load', () => {
        setTimeout(showMicWindow, 0);
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
            ensureMicOnTop();
            if (isMac) {
                micWindow.setIgnoreMouseEvents(true, { forward: true });
                micWindow.setFocusable(false);
            }
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
const showMainWindow = (route?: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        // Если указан маршрут, отправляем событие для навигации
        if (route) {
            mainWindow.webContents.send('navigate-to', route);
        }
    } else {
        createMainWindow();
        if (mainWindow) {
            mainWindow.once('ready-to-show', () => {
                mainWindow?.show();
                mainWindow?.focus();
                // Если указан маршрут, отправляем событие для навигации
                if (route) {
                    setTimeout(() => {
                        mainWindow?.webContents.send('navigate-to', route);
                    }, 100);
                }
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

    ipcMain.handle('mic:get-position', () => {
        if (!micWindow || micWindow.isDestroyed()) {
            return { x: 0, y: 0 };
        }
        const [x, y] = micWindow.getPosition();
        return { x, y };
    });

    ipcMain.handle('mic:move-by', (_event, dx: number, dy: number) => {
        if (!micWindow || micWindow.isDestroyed()) {
            return;
        }
        const [currentX, currentY] = micWindow.getPosition();
        moveMicWindow(currentX + dx, currentY + dy);
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
            const status = error?.response?.status;
            
            // Не показываем окно ошибки для 401/403, это означает что нужна авторизация
            if (status === 401 || status === 403) {
                sendLogToRenderer('USER', '🔒 Auth required (401/403), clearing tokens');
                await setAuthTokens({ accessToken: '', refreshToken: '' });
                currentUser = null;
                await broadcastConfigUpdate();
                return null;
            }
            
            // Для 500 ошибок - просто логируем, не показываем popup
            if (status >= 500) {
                sendLogToRenderer('USER', `⚠️ Server error (${status}), user data not available`);
                currentUser = null;
                return null;
            }
            
            // Для других ошибок показываем окно ошибки
            sendLogToRenderer('USER', `❌ User fetch failed with status ${status || 'unknown'}`);
            createOrShowErrorWindow({
                title: 'Failed to Load User',
                message: error?.response?.data?.detail || error?.message || 'Could not load user data. Please check your connection and try again.',
                details: JSON.stringify(error?.response?.data || error, null, 2)
            });
            
            currentUser = null;
            return null;
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
    
    // Загружаем текущего пользователя после успешной авторизации
    try {
        currentUser = await fetchCurrentUser();
        sendLogToRenderer('LOGIN', `✅ User fetched successfully: ${currentUser?.email || 'null'}`);
    } catch (error) {
        sendLogToRenderer('LOGIN', `⚠️ Failed to fetch user (will retry later): ${error}`);
        // Не блокируем создание микрофона если не удалось загрузить пользователя
        // currentUser останется null, но это не критично
    }

    try {
        const actions = await fetchActions();
        sendLogToRenderer('LOGIN', `🗂️ Actions synced (${actions.length})`);
    } catch (error) {
        sendLogToRenderer('LOGIN', `⚠️ Failed to sync actions after login: ${error}`);
    }
    
    sendLogToRenderer('LOGIN', `🔍 Check: setupCompleted=${config.setupCompleted}, micWindow exists=${!!micWindow && !micWindow.isDestroyed()}`);
    
    if (!micWindow || micWindow.isDestroyed()) {
        sendLogToRenderer('LOGIN', '🎤 Creating mic window after login...');
        void createMicWindow().then(() => {
            if (isDev && micWindow) {
                micWindow.webContents.openDevTools({mode: 'detach'});
            }
            if (config.setupCompleted && mainWindow && !mainWindow.isDestroyed()) {
                sendLogToRenderer('LOGIN', '🔒 Closing main window after mic window created');
                mainWindow.close();
            }
        }).catch((error) => sendLogToRenderer('LOGIN', `❌ Failed to create mic window: ${error}`));
    } else {
        sendLogToRenderer('LOGIN', '⏭️ Mic window already exists, skipping creation');
        if (config.setupCompleted && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close();
        }
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
            // Есть токен, пытаемся загрузить пользователя
            try {
                const user = await fetchCurrentUser();
                if (user) {
                    sendLogToRenderer('APP_READY', `✅ User loaded: ${user.email}`);
                }
            } catch (error) {
                sendLogToRenderer('APP_READY', `⚠️ Failed to load user on startup: ${error}`);
                // Не блокируем создание микрофона если не удалось загрузить пользователя
            }

            if (!micWindow || micWindow.isDestroyed()) {
                void createMicWindow().then(() => {
                    if (isDev && micWindow) {
                        micWindow.webContents.openDevTools({mode: 'detach'});
                    }
                }).catch((error) => {
                    sendLogToRenderer('APP_READY', `❌ Failed to create mic window: ${error}`);
                });
            }

            if (config.setupCompleted) {
                shouldShowMainWindow = false;
            }
        }
    } catch (error) {
        // Ошибка при проверке авторизации, показываем главное окно
        sendLogToRenderer('APP_READY', `❌ Error checking auth: ${error}`);
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
