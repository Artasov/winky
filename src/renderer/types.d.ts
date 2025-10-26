import type { ActionConfig, ActionIcon, AppConfig, AuthTokens, WinkyProfile } from '@shared/types';

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
  }

  interface WinkyActionsAPI {
    fetch(): Promise<ActionConfig[]>;
    create(action: { name: string; prompt: string; icon: string }): Promise<ActionConfig[]>;
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
    actions: WinkyActionsAPI;
    icons: WinkyIconsAPI;
    profile: WinkyProfileAPI;
    speech: WinkySpeechAPI;
    llm: WinkyLLMAPI;
    result: WinkyResultAPI;
    windows: WinkyWindowsAPI;
    windowControls: WinkyWindowControlsAPI;
    mic: WinkyMicAPI;
  }

  interface Window {
    winky?: WinkyPreload;
  }
}

export {};
