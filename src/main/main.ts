import { app, BrowserWindow, ipcMain, clipboard, Menu } from 'electron';
import path from 'path';
import axios from 'axios';
import { createTray, destroyTray } from './tray';
import {
  getConfig,
  updateConfig,
  setAuthTokens,
  setActions,
  getConfigFilePath,
  resetConfig
} from './config';
import {
  ACTIONS_CREATE_ENDPOINT,
  ACTIONS_ENDPOINT,
  APP_NAME,
  AUTH_ENDPOINT,
  API_BASE_URL_FALLBACKS
} from '@shared/constants';
import type { ActionConfig, AppConfig, AuthTokens, AuthResponse } from '@shared/types';
import { createApiClient } from '@shared/api';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

const preloadPath = path.resolve(__dirname, 'preload.js');
const rendererPath = path.resolve(__dirname, '../renderer/index.html');

type WindowMode = 'default' | 'main';

const DEFAULT_BOUNDS = { width: 960, height: 640 };
const MAIN_BOUNDS = { width: 280, height: 280 };

let currentWindowMode: WindowMode | null = null;
let clickThroughEnabled = false;
const dragState = {
  active: false,
  offsetX: 0,
  offsetY: 0
};

const applyClickThrough = (enabled: boolean) => {
  if (!mainWindow) {
    return;
  }

  if (clickThroughEnabled === enabled) {
    return;
  }

  clickThroughEnabled = enabled;
  if (enabled) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setFocusable(false);
  } else {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setFocusable(true);
  }
};

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: DEFAULT_BOUNDS.width,
    height: DEFAULT_BOUNDS.height,
    minWidth: DEFAULT_BOUNDS.width,
    minHeight: DEFAULT_BOUNDS.height,
    maxWidth: DEFAULT_BOUNDS.width,
    maxHeight: DEFAULT_BOUNDS.height,
    resizable: false,
    title: APP_NAME,
    frame: false,
    transparent: true,
    show: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
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
    dragState.active = false;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
};

const applyFixedSize = (window: BrowserWindow, width: number, height: number) => {
  window.setMinimumSize(width, height);
  window.setMaximumSize(width, height);
  window.setSize(width, height, false);
};

const setWindowMode = (mode: WindowMode) => {
  if (!mainWindow || currentWindowMode === mode) {
    return;
  }

  if (mode === 'main') {
    applyFixedSize(mainWindow, MAIN_BOUNDS.width, MAIN_BOUNDS.height);
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setResizable(false);
    mainWindow.setFullScreenable(false);
    mainWindow.setMaximizable(false);
    mainWindow.setMinimizable(true);
    mainWindow.setBackgroundColor('#00000000');
    mainWindow.setHasShadow(false);
    mainWindow.setOpacity(1);
    applyClickThrough(true);
    dragState.active = false;
  } else {
    applyFixedSize(mainWindow, DEFAULT_BOUNDS.width, DEFAULT_BOUNDS.height);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(false);
    mainWindow.setFullScreenable(false);
    mainWindow.setMaximizable(false);
    mainWindow.setMinimizable(true);
    mainWindow.setBackgroundColor('#111827');
    mainWindow.setHasShadow(true);
    mainWindow.setOpacity(1);
    applyClickThrough(false);
    dragState.active = false;
  }

  currentWindowMode = mode;
};

const setInteractive = (interactive: boolean) => {
  if (!mainWindow) {
    return;
  }

  if (currentWindowMode !== 'main') {
    applyClickThrough(false);
    return;
  }

  if (interactive) {
    applyClickThrough(false);
    mainWindow.focus();
  } else {
    applyClickThrough(true);
  }
};

const startWindowDrag = (screenX: number, screenY: number) => {
  if (!mainWindow || currentWindowMode !== 'main') {
    return false;
  }

  applyClickThrough(false);
  const [windowX, windowY] = mainWindow.getPosition();
  dragState.offsetX = screenX - windowX;
  dragState.offsetY = screenY - windowY;
  dragState.active = true;
  mainWindow.focus();
  return true;
};

const updateWindowDrag = (screenX: number, screenY: number) => {
  if (!mainWindow || !dragState.active || currentWindowMode !== 'main') {
    return;
  }

  const targetX = Math.round(screenX - dragState.offsetX);
  const targetY = Math.round(screenY - dragState.offsetY);
  mainWindow.setPosition(targetX, targetY, false);
};

const endWindowDrag = () => {
  dragState.active = false;
};

const createSettingsWindow = () => {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 640,
    title: `${APP_NAME} — Настройки`,
    parent: mainWindow ?? undefined,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      sandbox: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);

  if (isDev) {
    void settingsWindow.loadURL('http://localhost:5173/?window=settings#/settings');
  } else {
    void settingsWindow.loadFile(rendererPath, { hash: 'settings', search: '?window=settings' });
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
};

const registerIpcHandlers = () => {
  ipcMain.handle('config:get', async () => getConfig());

  ipcMain.handle('config:update', async (_event, partialConfig: Partial<AppConfig>) => {
    return updateConfig(partialConfig);
  });

  ipcMain.handle('config:setAuth', async (_event, tokens: AuthTokens) => {
    return setAuthTokens(tokens);
  });

  ipcMain.handle('config:reset', async () => {
    return resetConfig();
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

  ipcMain.handle('window:set-mode', (_event, mode: WindowMode) => {
    setWindowMode(mode);
  });

  ipcMain.handle('window:set-interactive', (_event, interactive: boolean) => {
    setInteractive(interactive);
  });

  ipcMain.handle('window:start-drag', (_event, { x, y }: { x: number; y: number }) => {
    return startWindowDrag(x, y);
  });

  ipcMain.on('window:update-drag', (_event, { x, y }: { x: number; y: number }) => {
    updateWindowDrag(x, y);
  });

  ipcMain.handle('window:end-drag', () => {
    endWindowDrag();
  });

  ipcMain.handle('auth:login', async (_event, credentials: { email: string; password: string }) => {
    console.log('[auth:login] IPC received', { email: credentials.email });
    return login(credentials);
  });

  ipcMain.handle('windows:open-settings', () => {
    createSettingsWindow();
  });

  ipcMain.handle('actions:fetch', async () => fetchActions());
  ipcMain.handle('actions:create', async (_event, action: Omit<ActionConfig, 'id'>) => createAction(action));
};

const login = async ({ email, password }: { email: string; password: string }) => {
  console.log('[auth:login] sending POST', AUTH_ENDPOINT, { email });
  let data: AuthResponse | undefined;
  let lastError: unknown = null;

  for (const baseUrl of API_BASE_URL_FALLBACKS) {
    const endpoint = `${baseUrl.replace(/\/$/, '')}/auth/login/`;
    try {
      ({ data } = await axios.post<AuthResponse>(endpoint, {
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
  return { tokens, user: data.user, config };
};

const fetchActions = async (): Promise<ActionConfig[]> => {
  const config = await getConfig();
  if (!config.auth.accessToken) {
    return config.actions;
  }

  const client = createApiClient(config.auth.accessToken);
  const { data } = await client.get<ActionConfig[]>(ACTIONS_ENDPOINT);
  await setActions(data);
  return data;
};

const createAction = async (action: Omit<ActionConfig, 'id'>): Promise<ActionConfig[]> => {
  const config = await getConfig();
  if (!config.auth.accessToken) {
    throw new Error('Необходимо авторизоваться.');
  }

  const client = createApiClient(config.auth.accessToken);
  const { data } = await client.post<ActionConfig>(ACTIONS_CREATE_ENDPOINT, action);
  const updated = [...config.actions.filter(({ id }) => id !== data.id), data];
  await setActions(updated);
  return updated;
};

const handleAppReady = async () => {
  app.setName(APP_NAME);
  Menu.setApplicationMenu(null);
  createMainWindow();
  createTray(() => createSettingsWindow());
  registerIpcHandlers();

  setWindowMode('default');

  if (isDev && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
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
