import { app, BrowserWindow, ipcMain, clipboard } from 'electron';
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

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: APP_NAME,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      sandbox: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
  } else {
    void mainWindow.loadFile(rendererPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      sandbox: false
    }
  });

  if (isDev) {
    void settingsWindow.loadURL('http://localhost:5173/#/settings');
  } else {
    void settingsWindow.loadFile(rendererPath, { hash: 'settings' });
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
  createMainWindow();
  createTray(() => createSettingsWindow());
  registerIpcHandlers();

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
