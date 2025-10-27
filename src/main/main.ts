import {app, BrowserWindow, BrowserWindowConstructorOptions, clipboard, ipcMain, Menu, screen, globalShortcut} from 'electron';
import path from 'path';
import axios from 'axios';
import {createTray, destroyTray} from './tray';
import {getConfig, getConfigFilePath, getStore, resetConfig, setActions, setAuthTokens, updateConfig} from './config';
import {ACTIONS_ENDPOINT, API_BASE_URL_FALLBACKS, APP_NAME, ICONS_ENDPOINT, ME_ENDPOINT, PROFILE_ENDPOINT} from '@shared/constants';
import type {ActionConfig, ActionIcon, AppConfig, AuthResponse, AuthTokens, MicAnchor, User, WinkyProfile} from '@shared/types';
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
let micWindowVisible = false;
let lastMicToggleTime = 0;
let hotkeyToggleLocked = false;
let micWindowAutoShowDisabled = false;
let micWindowFadeTimeout: NodeJS.Timeout | null = null;

const MIC_WINDOW_WIDTH = 160;
const MIC_WINDOW_HEIGHT = 160;
const MIC_WINDOW_MARGIN = 24;
const MIC_BUTTON_SIZE = 80;

let registeredMicShortcut: string | null = null;

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
    // НЕ вызываем moveTop() чтобы не показывать окно
};

const computeAnchorPosition = (anchor: MicAnchor, targetDisplay: Electron.Display) => {
    const area = targetDisplay.workArea;
    const buttonHalf = MIC_BUTTON_SIZE / 2;
    const windowHalfWidth = MIC_WINDOW_WIDTH / 2;
    const windowHalfHeight = MIC_WINDOW_HEIGHT / 2;
    const centerMarginX = buttonHalf + MIC_WINDOW_MARGIN;
    const centerMarginY = buttonHalf + MIC_WINDOW_MARGIN;
    const maxX = area.x + area.width - MIC_WINDOW_WIDTH;
    const maxY = area.y + area.height - MIC_WINDOW_HEIGHT;

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const compute = (centerX: number, centerY: number) => ({
        x: clamp(Math.round(centerX - windowHalfWidth), area.x, maxX),
        y: clamp(Math.round(centerY - windowHalfHeight), area.y, maxY)
    });

    switch (anchor) {
        case 'top-left':
            return compute(area.x + centerMarginX, area.y + centerMarginY);
        case 'top-right':
            return compute(area.x + area.width - centerMarginX, area.y + centerMarginY);
        case 'bottom-left':
            return compute(area.x + centerMarginX, area.y + area.height - centerMarginY);
        case 'bottom-right':
        default:
            return compute(area.x + area.width - centerMarginX, area.y + area.height - centerMarginY);
    }
};

const applyMicAnchorPosition = async (anchor: MicAnchor | undefined, persist = false) => {
    const effectiveAnchor: MicAnchor = anchor && ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(anchor)
        ? anchor as MicAnchor
        : 'bottom-right';

    const display = micWindow && !micWindow.isDestroyed()
        ? screen.getDisplayMatching(micWindow.getBounds())
        : screen.getPrimaryDisplay();

    const position = computeAnchorPosition(effectiveAnchor, display);

    if (micWindow && !micWindow.isDestroyed()) {
        moveMicWindow(position.x, position.y);
        ensureMicOnTop();
    }

    if (persist) {
        await updateConfig({ micAnchor: effectiveAnchor, micWindowPosition: position });
        await broadcastConfigUpdate();
    }

    return position;
};

const clearMicWindowFadeTimeout = () => {
    if (micWindowFadeTimeout) {
        clearTimeout(micWindowFadeTimeout);
        micWindowFadeTimeout = null;
    }
};
const showMicWindowInstance = () => {
    console.log('[Mic] showMicWindowInstance called', { micWindowVisible, micWindowAutoShowDisabled });
    if (!micWindow || micWindow.isDestroyed()) {
        console.log('[Mic] Window destroyed, ignoring');
        return;
    }

    console.log('[Mic] Window state:', {
        isVisible: micWindow.isVisible(),
        isMinimized: micWindow.isMinimized(),
        isMaximized: micWindow.isMaximized(),
        isFocused: micWindow.isFocused()
    });

    micWindowAutoShowDisabled = false;
    clearMicWindowFadeTimeout();
    micWindow.setOpacity(0);

    const performShow = () => {
        if (!micWindow || micWindow.isDestroyed()) {
            return;
        }

        console.log('[Mic] Performing show routine');
        if (process.platform === 'darwin') {
            micWindow.showInactive();
        } else {
            micWindow.show();
        }
        micWindow.setSkipTaskbar(true);
        micWindowVisible = true;
        ensureMicOnTop();
        setMicInteractive(false);

        clearMicWindowFadeTimeout();
        micWindowFadeTimeout = setTimeout(() => {
            if (!micWindow || micWindow.isDestroyed() || !micWindowVisible) {
                return;
            }
            micWindow.setOpacity(1);
            ensureMicOnTop();
            micWindowFadeTimeout = null;
            console.log('[Mic] Window opacity restored to 1');
        }, 16);

        console.log('[Mic] Window state after show:', {
            isVisible: micWindow.isVisible(),
            isMinimized: micWindow.isMinimized(),
            isMaximized: micWindow.isMaximized(),
            isFocused: micWindow.isFocused()
        });

        const [x, y] = micWindow.getPosition();
        const [width, height] = micWindow.getSize();
        console.log('[Mic] Window position and size:', { x, y, width, height });
        console.log('[Mic] Window shown successfully');
    };

    console.log('[Mic] Showing window');
    if (micWindow.webContents.isLoading()) {
        console.log('[Mic] Content still loading, waiting...');
        micWindow.webContents.once('did-finish-load', () => {
            if (!micWindow || micWindow.isDestroyed()) {
                return;
            }
            console.log('[Mic] Content loaded, executing show');
            performShow();
        });
    } else {
        console.log('[Mic] Content already loaded, showing immediately');
        performShow();
    }
};

const toggleMicWindow = async (fromShortcut = false) => {
    console.log('[Hotkey] toggleMicWindow called', { fromShortcut, micWindowVisible, micWindowAutoShowDisabled, hotkeyToggleLocked });
    
    if (fromShortcut) {
        const now = Date.now();
        if (hotkeyToggleLocked) {
            console.log('[Hotkey] Toggle locked, ignoring');
            return;
        }
        if (now - lastMicToggleTime < 500) { // Увеличили с 100ms до 500ms
            console.log('[Hotkey] Too soon since last toggle, ignoring');
            return;
        }
        lastMicToggleTime = now;
        hotkeyToggleLocked = true;
        console.log('[Hotkey] Locking toggle for 1000ms');
        setTimeout(() => {
            hotkeyToggleLocked = false;
            console.log('[Hotkey] Toggle lock released');
        }, 1000); // Увеличили с 200ms до 1000ms
    }

    if (!micWindow || micWindow.isDestroyed()) {
        console.log('[Hotkey] Creating mic window');
        await createMicWindow();
        console.log('[Hotkey] Mic window created, now showing');
        showMicWindowInstance();
        return;
    }

    if (micWindowVisible) {
        console.log('[Hotkey] Hiding mic window');
        micWindowAutoShowDisabled = true;
        micWindowVisible = false;
        setMicInteractive(false);
        clearMicWindowFadeTimeout();
        if (micWindow && !micWindow.isDestroyed()) {
            micWindow.setOpacity(0);
        }
        micWindow.hide();
        console.log('[Hotkey] Mic window hidden');
        if (fromShortcut) {
            lastMicToggleTime = Date.now();
        }
        return;
    }

    console.log('[Hotkey] Showing mic window');
    if (fromShortcut) {
        lastMicToggleTime = Date.now();
    }
    
    // Сбрасываем флаг auto-show disabled перед показом
    micWindowAutoShowDisabled = false;
    showMicWindowInstance();
};

const toElectronAccelerator = (accelerator: string): string | null => {
    if (!accelerator) {
        return null;
    }
    const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
        return null;
    }

    const mapped: string[] = [];
    let hasKey = false;

    parts.forEach((part) => {
        const upper = part.toUpperCase();
        switch (upper) {
            case 'CTRL':
            case 'CONTROL':
                mapped.push('CommandOrControl');
                break;
            case 'CMD':
            case 'COMMAND':
                mapped.push('Command');
                break;
            case 'ALT':
            case 'OPTION':
                mapped.push('Alt');
                break;
            case 'SHIFT':
                mapped.push('Shift');
                break;
            case 'SUPER':
            case 'WIN':
                mapped.push('Super');
                break;
            default: {
                hasKey = true;
                mapped.push(part.length === 1 ? part.toUpperCase() : part);
            }
        }
    });

    if (!hasKey) {
        return null;
    }

    return mapped.join('+');
};

const registerMicShortcut = async () => {
    const config = await getConfig();
    const accelerator = (config.micHotkey || '').trim();

    if (registeredMicShortcut) {
        globalShortcut.unregister(registeredMicShortcut);
        registeredMicShortcut = null;
    }

    if (!accelerator) {
        return;
    }

    try {
        const electronAccelerator = toElectronAccelerator(accelerator);
        if (!electronAccelerator) {
            console.warn(`[Hotkey] Invalid shortcut ${accelerator}`);
            return;
        }

        const success = globalShortcut.register(electronAccelerator, () => {
            console.log('[Hotkey] Shortcut triggered:', electronAccelerator);
            void toggleMicWindow(true);
        });
        if (success) {
            registeredMicShortcut = electronAccelerator;
            console.log(`[Hotkey] Successfully registered shortcut: ${accelerator} -> ${electronAccelerator}`);
        } else {
            console.warn(`[Hotkey] Failed to register shortcut ${accelerator}`);
        }
    } catch (error) {
        console.error(`[Hotkey] Error registering shortcut ${accelerator}`, error);
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
    
    // Не делаем окно интерактивным если оно скрыто или auto-show отключен
    if (interactive && (!micWindowVisible || micWindowAutoShowDisabled)) {
        return;
    }
    
    const platform = process.platform;
    if (interactive) {
        if (platform === 'win32') {
            micWindow.setIgnoreMouseEvents(false);
        }
        if (platform === 'darwin') {
            micWindow.setFocusable(true);
            // НЕ вызываем focus() чтобы не показывать окно
        }
        ensureMicOnTop();
        micWindow.flashFrame(false);
    } else {
        if (platform === 'win32') {
            micWindow.setIgnoreMouseEvents(true, { forward: true });
        }
        if (platform === 'darwin') {
            micWindow.setFocusable(false);
            micWindow.blur();
        }
        // НЕ вызываем ensureMicOnTop() после скрытия окна
    }
};

const moveMicWindow = (x: number, y: number) => {
    if (!micWindow || micWindow.isDestroyed()) {
        return;
    }
    micWindow.setPosition(Math.round(x), Math.round(y), false);
    ensureMicOnTop();
};

const moveMicWindowBy = (dx: number, dy: number) => {
    if (!micWindow || micWindow.isDestroyed()) {
        return;
    }
    const [currentX, currentY] = micWindow.getPosition();
    moveMicWindow(currentX + dx, currentY + dy);
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
        show: false, // Не показываем окно сразу
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: '#00000000', // Полностью прозрачный фон
        type: isMac ? 'panel' : 'toolbar',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            sandbox: false,
            webSecurity: false, // Разрешаем загрузку локальных ресурсов из asar
            offscreen: false, // Отключаем offscreen рендеринг для лучшей производительности
            backgroundThrottling: false // Отключаем throttling фоновых процессов
        }
    };

    const anchorFromStore = config.get('micAnchor') as MicAnchor | undefined;
    if (safePosition) {
        windowOptions.x = safePosition.x;
        windowOptions.y = safePosition.y;
    } else if (anchorFromStore) {
        const display = screen.getPrimaryDisplay();
        const anchorPosition = computeAnchorPosition(anchorFromStore, display);
        windowOptions.x = anchorPosition.x;
        windowOptions.y = anchorPosition.y;
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
    
    // Дополнительные настройки для предотвращения мерцания
    micWindow.setBackgroundColor('#00000000'); // Убеждаемся что фон прозрачный
    
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

    if (process.platform === 'win32') {
        micWindow.setIgnoreMouseEvents(true, { forward: true });
    }

    if (isDev) {
        void micWindow.loadURL('http://localhost:5173/?window=mic#/mic');
    } else {
        void micWindow.loadFile(rendererPath, {hash: '/mic', query: {window: 'mic'}});
    }

    // Не показываем окно автоматически при создании
    // Оно будет показано только через hotkey

    micWindow.on('show', () => {
        console.log('[Mic] Window show event fired');
        micWindowVisible = true;
    });

    micWindow.on('hide', () => {
        console.log('[Mic] Window hide event fired');
        micWindowVisible = false;
        setMicInteractive(false);
        clearMicWindowFadeTimeout();
        if (micWindow && !micWindow.isDestroyed()) {
            micWindow.setOpacity(0);
        }
    });

    micWindow.on('closed', () => {
        micWindowVisible = false;
        micWindow = null;
        clearMicWindowFadeTimeout();
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
        await registerMicShortcut();
        if (typeof partialConfig.micAnchor === 'string') {
            void applyMicAnchorPosition(partialConfig.micAnchor as MicAnchor, false);
        }
        
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
        await registerMicShortcut();
        return updated;
    });

    ipcMain.handle('config:reset', async () => {
        const reset = await resetConfig();
        await broadcastConfigUpdate();
        await registerMicShortcut();
        
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

    ipcMain.handle('mic:move-by', (_event, dx: number, dy: number) => {
        moveMicWindowBy(dx, dy);
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

    ipcMain.handle('mic:set-anchor', async (_event, anchor: MicAnchor) => {
        const position = await applyMicAnchorPosition(anchor, true);
        return position;
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
    await registerMicShortcut();

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

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
