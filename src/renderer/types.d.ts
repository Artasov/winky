import type {
    ActionConfig,
    ActionIcon,
    AppConfig,
    AuthDeepLinkPayload,
    AuthProvider,
    AuthTokens,
    FastWhisperStatus,
    User,
    WinkyProfile
} from '@shared/types';

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
        startOAuth(provider: AuthProvider): Promise<void>;

        onOAuthPayload(cb: (payload: AuthDeepLinkPayload) => void): () => void;

        consumePendingOAuthPayloads(): Promise<AuthDeepLinkPayload[]>;
    }

    interface WinkyActionsAPI {
        fetch(): Promise<ActionConfig[]>;

        create(action: {
            name: string;
            prompt: string;
            prompt_recognizing?: string;
            hotkey?: string;
            icon: string;
            show_results?: boolean;
            sound_on_complete?: boolean;
            auto_copy_result?: boolean
        }): Promise<ActionConfig[]>;

        update(actionId: string, action: {
            name: string;
            prompt: string;
            prompt_recognizing?: string;
            hotkey?: string;
            icon: string;
            show_results?: boolean;
            sound_on_complete?: boolean;
            auto_copy_result?: boolean
        }): Promise<ActionConfig[]>;

        delete(actionId: string): Promise<ActionConfig[]>;
    }

    interface WinkyIconsAPI {
        fetch(): Promise<ActionIcon[]>;
    }

    interface WinkyResourcesAPI {
        getSoundPath(soundName: string): Promise<string>;
    }

    interface WinkyProfileAPI {
        fetch(): Promise<WinkyProfile>;
        currentUser?(options?: { includeTiersAndFeatures?: boolean }): Promise<User | null>;
    }

    interface WinkyWindowsAPI {
        openSettings(): Promise<void>;
        navigate(route: string): Promise<void>;
    }

    interface WinkyNotificationsAPI {
        showToast(message: string, type?: 'success' | 'error' | 'info', options?: { durationMs?: number }): Promise<void>;
    }

    interface WinkyWindowControlsAPI {
        minimize(): Promise<void>;

        close(): Promise<void>;
    }

    interface WinkyMicAPI {
        moveWindow(x: number, y: number): Promise<void>;

        setInteractive(interactive: boolean): Promise<void>;

        getPosition(): Promise<{ x: number; y: number }>;

        getCursorPosition(): Promise<{ x: number; y: number }>;

        moveBy(dx: number, dy: number): Promise<void>;

        setAnchor(anchor: string): Promise<{ x: number; y: number }>;

        show(reason?: string): Promise<void>;

        hide(options?: { reason?: string; disableAutoShow?: boolean }): Promise<void>;

        toggle?(reason?: string): Promise<void>;

        beginDrag(): Promise<void>;
    }

    interface WinkySpeechAPI {
        transcribe(audioData: ArrayBuffer, config: {
            mode: string;
            model: string;
            openaiKey?: string;
            googleKey?: string;
            accessToken?: string;
            prompt?: string;
        }): Promise<string>;
    }

    interface WinkyLocalSpeechAPI {
        getStatus(): Promise<FastWhisperStatus>;

        checkHealth(): Promise<FastWhisperStatus>;

        install(): Promise<FastWhisperStatus>;

        start(): Promise<FastWhisperStatus>;

        restart(): Promise<FastWhisperStatus>;

        reinstall(): Promise<FastWhisperStatus>;

        stop(): Promise<FastWhisperStatus>;

        onStatus(callback: (status: FastWhisperStatus) => void): () => void;
    }

    interface WinkyLLMAPI {
        process(text: string, prompt: string, config: {
            mode: string;
            model: string;
            openaiKey?: string;
            googleKey?: string;
            accessToken?: string
        }): Promise<string>;

        processStream(text: string, prompt: string, config: {
            mode: string;
            model: string;
            openaiKey?: string;
            googleKey?: string;
            accessToken?: string
        }): Promise<string>;
    }

    interface WinkyResultAPI {
        open(): Promise<void>;

        close(): Promise<void>;

        update(data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }): Promise<void>;

        onData(callback: (data: {
            transcription?: string;
            llmResponse?: string;
            isStreaming?: boolean
        }) => void): () => void;
    }

    interface WinkyActionHotkeysAPI {
        register(hotkeys: Array<{ id: string; accelerator: string }>): Promise<void>;
        clear(): Promise<void>;
    }

    interface WinkyPreload {
        config: WinkyConfigAPI;
        clipboard: WinkyClipboardAPI;
        auth: WinkyAuthAPI;
        actions: WinkyActionsAPI;
        icons: WinkyIconsAPI;
        resources: WinkyResourcesAPI;
        profile: WinkyProfileAPI;
        speech: WinkySpeechAPI;
        localSpeech: WinkyLocalSpeechAPI;
        llm: WinkyLLMAPI;
        result: WinkyResultAPI;
        windows: WinkyWindowsAPI;
        notifications: WinkyNotificationsAPI;
        windowControls: WinkyWindowControlsAPI;
        mic: WinkyMicAPI;
        actionHotkeys: WinkyActionHotkeysAPI;

        on(channel: string, callback: (...args: any[]) => void): () => void;

        removeListener(channel: string, callback: (...args: any[]) => void): void;
    }

    interface Window {
        winky?: WinkyPreload;
    }
}

export {};
