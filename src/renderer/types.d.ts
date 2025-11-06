import type { ActionConfig, ActionIcon, AppConfig, AuthTokens, WinkyProfile, User, AuthDeepLinkPayload, AuthProvider } from '@shared/types';

declare global {
  interface WinkyConfigAPI {
    get(): Promise<AppConfig>;
    update(payload: Partial<AppConfig>): Promise<AppConfig>;
    setAuth(tokens: AuthTokens): Promise<AppConfig>;
    reset(): Promise<AppConfig>;
    path(): Promise<string>;
    subscribe?(listener: (config: AppConfig) => void): () => void;
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
    logout(): Promise<boolean>;
    startOAuth(provider: AuthProvider): Promise<void>;
    onOAuthPayload(cb: (payload: AuthDeepLinkPayload) => void): () => void;
    consumePendingOAuthPayloads(): Promise<AuthDeepLinkPayload[]>;
  }

  interface WinkyUserAPI {
    fetch(): Promise<User | null>;
    getCached(): Promise<User | null>;
  }

  interface WinkyActionsAPI {
    fetch(): Promise<ActionConfig[]>;
    create(action: { name: string; prompt: string; hotkey?: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]>;
    update(actionId: string, action: { name: string; prompt: string; hotkey?: string; icon: string; show_results?: boolean; sound_on_complete?: boolean; auto_copy_result?: boolean }): Promise<ActionConfig[]>;
    delete(actionId: string): Promise<ActionConfig[]>;
  }

  interface WinkyIconsAPI {
    fetch(): Promise<ActionIcon[]>;
  }

  interface WinkyProfileAPI {
    fetch(): Promise<WinkyProfile>;
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
    getPosition(): Promise<{ x: number; y: number }>;
    moveBy(dx: number, dy: number): Promise<void>;
    setAnchor(anchor: string): Promise<{ x: number; y: number }>;
    show(reason?: string): Promise<void>;
    hide(options?: { reason?: string; disableAutoShow?: boolean }): Promise<void>;
  }

  interface WinkySpeechAPI {
    transcribe(audioData: ArrayBuffer, config: { mode: string; model: string; openaiKey?: string; googleKey?: string }): Promise<string>;
  }

  interface WinkyLLMAPI {
    process(text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string>;
    processStream(text: string, prompt: string, config: { mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string }): Promise<string>;
  }

  interface WinkyResultAPI {
    open(): Promise<void>;
    close(): Promise<void>;
    update(data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }): Promise<void>;
    onData(callback: (data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }) => void): () => void;
  }

  interface WinkyPreload {
    config: WinkyConfigAPI;
    clipboard: WinkyClipboardAPI;
    auth: WinkyAuthAPI;
    user: WinkyUserAPI;
    actions: WinkyActionsAPI;
    icons: WinkyIconsAPI;
    profile: WinkyProfileAPI;
    speech: WinkySpeechAPI;
    llm: WinkyLLMAPI;
    result: WinkyResultAPI;
    windows: WinkyWindowsAPI;
    windowControls: WinkyWindowControlsAPI;
    mic: WinkyMicAPI;
    on(channel: string, callback: (...args: any[]) => void): void;
    removeListener(channel: string, callback: (...args: any[]) => void): void;
  }

  interface Window {
    winky?: WinkyPreload;
  }
}

export {};
