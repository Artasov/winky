import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { ActionConfig, ActionIcon, AppConfig, AuthTokens, User, WinkyProfile } from '@shared/types';

type UpdateConfigPayload = Partial<AppConfig>;
type LoginResponse = {
  tokens: AuthTokens;
  user?: Record<string, unknown>;
  config: AppConfig;
};

// Слушаем логи API из main process и выводим в консоль браузера
ipcRenderer.on('api-log', (_event, { type, data }) => {
  switch (type) {
    case 'api-request':
      console.log(`%cAPI → %c[${data.method}] %c${data.url}`, 
        'color: #10b981; font-weight: bold',
        'color: #3b82f6; font-weight: bold',
        'color: #8b5cf6'
      );
      if (data.data) {
        console.log('  📤 Request data:', data.data);
      }
      break;
    case 'api-response':
      console.log(`%cAPI ← %c[${data.method}] %c${data.url} %c[${data.status}]`, 
        'color: #10b981; font-weight: bold',
        'color: #3b82f6; font-weight: bold',
        'color: #8b5cf6',
        'color: #22c55e; font-weight: bold'
      );
      console.log('  📥 Response data:', data.data);
      break;
    case 'api-error':
    case 'api-response-error':
      console.error(`%cAPI ← %c[${data.method}] %c${data.url} %c[${data.status}]`, 
        'color: #ef4444; font-weight: bold',
        'color: #3b82f6; font-weight: bold',
        'color: #8b5cf6',
        'color: #ef4444; font-weight: bold'
      );
      console.error('  ❌ Error:', data.error);
      break;
  }
});

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
    update: (payload: UpdateConfigPayload): Promise<AppConfig> => ipcRenderer.invoke('config:update', payload),
    setAuth: (tokens: AuthTokens): Promise<AppConfig> => ipcRenderer.invoke('config:setAuth', tokens),
    reset: (): Promise<AppConfig> => ipcRenderer.invoke('config:reset'),
    path: (): Promise<string> => ipcRenderer.invoke('config:path'),
    subscribe: (listener: (config: AppConfig) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, updated: AppConfig) => {
        listener(updated);
      };
      ipcRenderer.on('config:updated', handler);
      return () => {
        ipcRenderer.removeListener('config:updated', handler);
      };
    }
  },
  clipboard: {
    writeText: (text: string): Promise<boolean> => ipcRenderer.invoke('clipboard:write', text)
  },
  auth: {
    login: (email: string, password: string): Promise<LoginResponse> =>
      ipcRenderer.invoke('auth:login', { email, password }),
    logout: (): Promise<boolean> => ipcRenderer.invoke('auth:logout')
  },
  actions: {
    fetch: (): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:fetch'),
    create: (action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:create', action),
    update: (actionId: string, action: { name: string; prompt: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:update', actionId, action),
    delete: (actionId: string): Promise<ActionConfig[]> => ipcRenderer.invoke('actions:delete', actionId)
  },
  icons: {
    fetch: (): Promise<ActionIcon[]> => ipcRenderer.invoke('icons:fetch')
  },
  profile: {
    fetch: (): Promise<WinkyProfile> => ipcRenderer.invoke('profile:fetch')
  },
  user: {
    fetch: (): Promise<User | null> => ipcRenderer.invoke('user:fetch'),
    getCached: (): Promise<User | null> => ipcRenderer.invoke('user:get-cached')
  },
  speech: {
    transcribe: (audioData: ArrayBuffer, config: { mode: string; model: string; openaiKey?: string; googleKey?: string }): Promise<string> => 
      ipcRenderer.invoke('speech:transcribe', audioData, config)
  },
  llm: {
    process: (text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string> =>
      ipcRenderer.invoke('llm:process', text, prompt, config),
    processStream: (text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string> =>
      ipcRenderer.invoke('llm:process-stream', text, prompt, config)
  },
  result: {
    open: (): Promise<void> => ipcRenderer.invoke('result:open'),
    close: (): Promise<void> => ipcRenderer.invoke('result:close'),
    update: (data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }): Promise<void> => 
      ipcRenderer.invoke('result:update', data),
    onData: (callback: (data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, data: any) => {
        callback(data);
      };
      ipcRenderer.on('result:data', handler);
      return () => {
        ipcRenderer.removeListener('result:data', handler);
      };
    }
  },
  windows: {
    openSettings: (): Promise<void> => ipcRenderer.invoke('windows:open-settings'),
    setMode: (mode: 'default' | 'main'): Promise<void> => ipcRenderer.invoke('window:set-mode', mode)
  },
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  },
  mic: {
    moveWindow: (x: number, y: number): Promise<void> => ipcRenderer.invoke('mic:move-window', x, y),
    setInteractive: (interactive: boolean): Promise<void> => ipcRenderer.invoke('mic:set-interactive', interactive),
    getPosition: (): Promise<{ x: number; y: number }> => ipcRenderer.invoke('mic:get-position'),
    moveBy: (dx: number, dy: number): Promise<void> => ipcRenderer.invoke('mic:move-by', dx, dy),
    setAnchor: (anchor: string): Promise<{ x: number; y: number }> => ipcRenderer.invoke('mic:set-anchor', anchor)
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  }
};

contextBridge.exposeInMainWorld('winky', api);
contextBridge.exposeInMainWorld('electron', {
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  }
});

export type WinkyPreload = typeof api;
