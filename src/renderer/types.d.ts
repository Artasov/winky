import type { ActionConfig, AppConfig, AuthTokens } from '@shared/types';

declare global {
  interface WinkyConfigAPI {
    get(): Promise<AppConfig>;
    update(payload: Partial<AppConfig>): Promise<AppConfig>;
    setAuth(tokens: AuthTokens): Promise<AppConfig>;
    reset(): Promise<AppConfig>;
    path(): Promise<string>;
  }

  interface WinkyClipboardAPI {
    writeText(text: string): Promise<boolean>;
  }

  interface WinkyActionsAPI {
    fetch(): Promise<ActionConfig[]>;
    create(action: Omit<ActionConfig, 'id'>): Promise<ActionConfig[]>;
  }

  interface WinkyWindowsAPI {
    openSettings(): Promise<void>;
  }

  interface WinkyPreload {
    config: WinkyConfigAPI;
    clipboard: WinkyClipboardAPI;
    actions: WinkyActionsAPI;
    windows: WinkyWindowsAPI;
  }

  interface Window {
    winky: WinkyPreload;
  }
}

export {};
