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

  interface WinkyAuthAPI {
    login(email: string, password: string): Promise<{
      tokens: AuthTokens;
      user?: Record<string, unknown>;
      config: AppConfig;
    }>;
  }

  interface WinkyActionsAPI {
    fetch(): Promise<ActionConfig[]>;
    create(action: Omit<ActionConfig, 'id'>): Promise<ActionConfig[]>;
  }

  interface WinkyWindowsAPI {
    openSettings(): Promise<void>;
    setMode(mode: 'default' | 'main'): Promise<void>;
  }

  interface WinkyWindowControlsAPI {
    minimize(): Promise<void>;
    close(): Promise<void>;
  }

  interface WinkyMicAPI {
    moveWindow(x: number, y: number): Promise<void>;
    setInteractive(interactive: boolean): Promise<void>;
  }

  interface WinkyPreload {
    config: WinkyConfigAPI;
    clipboard: WinkyClipboardAPI;
    auth: WinkyAuthAPI;
    actions: WinkyActionsAPI;
    windows: WinkyWindowsAPI;
    windowControls: WinkyWindowControlsAPI;
    mic: WinkyMicAPI;
  }

  interface Window {
    winky?: WinkyPreload;
  }
}

export {};
