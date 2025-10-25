import { contextBridge, ipcRenderer } from 'electron';
import type { ActionConfig, AppConfig, AuthTokens } from '@shared/types';

type UpdateConfigPayload = Partial<AppConfig>;
type LoginResponse = {
  tokens: AuthTokens;
  user?: Record<string, unknown>;
  config: AppConfig;
};

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    update: (payload: UpdateConfigPayload): Promise<AppConfig> => ipcRenderer.invoke('config:update', payload),
    setAuth: (tokens: AuthTokens): Promise<AppConfig> => ipcRenderer.invoke('config:setAuth', tokens),
    reset: (): Promise<AppConfig> => ipcRenderer.invoke('config:reset'),
    path: (): Promise<string> => ipcRenderer.invoke('config:path')
  },
  clipboard: {
    writeText: (text: string): Promise<boolean> => ipcRenderer.invoke('clipboard:write', text)
  },
  auth: {
    login: (email: string, password: string): Promise<LoginResponse> =>
      ipcRenderer.invoke('auth:login', { email, password })
  },
  actions: {
    fetch: (): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:fetch'),
    create: (action: Omit<ActionConfig, 'id'>): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:create', action)
  },
  windows: {
    openSettings: (): Promise<void> => ipcRenderer.invoke('windows:open-settings'),
    setMode: (mode: 'default' | 'main'): Promise<void> => ipcRenderer.invoke('window:set-mode', mode)
  },
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    setInteractive: (interactive: boolean): Promise<void> => ipcRenderer.invoke('window:set-interactive', interactive)
  }
};

contextBridge.exposeInMainWorld('winky', api);

export type WinkyPreload = typeof api;
