import { app, BrowserWindow, ipcMain, clipboard, Menu, screen } from 'electron';
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
const MAIN_BOUNDS = { width: 220, height: 220 };

let currentWindowMode: WindowMode | null = null;
let micWindow: BrowserWindow | null = null;

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
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
};

const createMicWindow = () => {
  if (micWindow) {
    return micWindow;
  }

  micWindow = new BrowserWindow({
    width: MAIN_BOUNDS.width,
    height: MAIN_BOUNDS.height,
    resizable: false,
    frame: false,
    transparent: true,
    show: false,
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
  micWindow.setAlwaysOnTop(true, 'screen-saver');
  micWindow.setFocusable(true);

  if (isDev) {
    void micWindow.loadURL('http://localhost:5173/?window=mic#/main');
  } else {
    void micWindow.loadFile(rendererPath, { hash: 'main', query: { window: 'mic' } });
  }

  micWindow.once('ready-to-show', () => {
    if (currentWindowMode === 'main') {
      micWindow?.show();
      micWindow?.focus();
    }
  });

  micWindow.on('closed', () => {
    micWindow = null;
  });

  return micWindow;
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
    const mic = createMicWindow();
    mainWindow.hide();
    if (mic) {
      mic.show();
      mic.focus();
    }
  } else {
    if (micWindow) {
      micWindow.hide();
    }
    mainWindow.show();
    mainWindow.focus();
  }

  currentWindowMode = mode;
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
  console.log('[auth:login] starting login attempts', { email, endpoints: API_BASE_URL_FALLBACKS.length });
  let data: AuthResponse | undefined;
  let lastError: unknown = null;

  for (const baseUrl of API_BASE_URL_FALLBACKS) {
    const endpoint = `${baseUrl.replace(/\/$/, '')}/auth/login/`;
    try {
      console.log('[auth:login] attempt', endpoint);
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
  console.debug('[main] actions:fetch invoked');
  const config = await getConfig();
  if (!config.auth.accessToken) {
    console.debug('[main] actions:fetch skipped (no access token)');
    return config.actions;
  }

  const client = createApiClient(config.auth.accessToken);
  const { data } = await client.get<ActionConfig[]>(ACTIONS_ENDPOINT);
  console.debug('[main] actions:fetch success', { count: data.length });
  await setActions(data);
  return data;
};

const createAction = async (action: Omit<ActionConfig, 'id'>): Promise<ActionConfig[]> => {
  console.debug('[main] actions:create invoked', { name: action.name });
  const config = await getConfig();
  if (!config.auth.accessToken) {
    throw new Error('Необходимо авторизоваться.');
  }

  const client = createApiClient(config.auth.accessToken);
  const { data } = await client.post<ActionConfig>(ACTIONS_CREATE_ENDPOINT, action);
  const updated = [...config.actions.filter(({ id }) => id !== data.id), data];
  await setActions(updated);
  console.debug('[main] actions:create success', { actionId: data.id });
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
