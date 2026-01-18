import type {
    ActionConfig,
    ActionIcon,
    ActionHistoryEntry,
    AppConfig,
    AuthDeepLinkPayload,
    AuthProvider,
    AuthTokens,
    FastWhisperStatus,
    WinkyNote,
    WinkyProfile
} from '@shared/types';

declare global {
    interface WinkyConfigAPI {
        get(): Promise<AppConfig>;

        update(payload: Partial<AppConfig>): Promise<AppConfig>;

        setAuth(tokens: AuthTokens): Promise<AppConfig>;

        reset(): Promise<AppConfig>;

        path(): Promise<string>;

        subscribe(callback: (config: AppConfig) => void): () => void;
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
            priority?: number;
            show_results?: boolean;
            sound_on_complete?: boolean;
            auto_copy_result?: boolean
        }): Promise<ActionConfig[]>;

        update(actionId: string, action: {
            name?: string;
            prompt?: string;
            prompt_recognizing?: string;
            hotkey?: string;
            icon?: string;
            priority?: number;
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

        getSoundData(soundName: string): Promise<Uint8Array>;
    }

    interface WinkyProfileAPI {
        fetch(): Promise<WinkyProfile>;
    }

    interface WinkyWindowsAPI {
        openSettings(): Promise<void>;

        navigate(route: string): Promise<void>;
    }

    interface WinkyNotificationsAPI {
        showToast(message: string, type?: 'success' | 'error' | 'info', options?: {
            durationMs?: number
        }): Promise<void>;
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
        }, options?: { signal?: AbortSignal; uiTimeoutMs?: number; mimeType?: string; fileName?: string }): Promise<string>;
    }

    interface WinkyLocalSpeechAPI {
        getStatus(): Promise<FastWhisperStatus>;

        checkHealth(): Promise<FastWhisperStatus>;

        install(targetDir?: string): Promise<FastWhisperStatus>;

        start(): Promise<FastWhisperStatus>;

        restart(): Promise<FastWhisperStatus>;

        reinstall(targetDir?: string): Promise<FastWhisperStatus>;

        stop(): Promise<FastWhisperStatus>;

        isModelDownloaded(model: string): Promise<boolean>;

        onStatus(callback: (status: FastWhisperStatus) => void): () => void;
    }

    interface WinkyLLMAPI {
        process(text: string, prompt: string, config: {
            mode: string;
            model: string;
            openaiKey?: string;
            googleKey?: string;
            accessToken?: string
        }, options?: { onChunk?: (chunk: string) => void }): Promise<string>;
    }

    interface WinkyOllamaAPI {
        checkInstalled(): Promise<boolean>;
        
        isServerRunning(): Promise<boolean>;

        listModels(force?: boolean): Promise<string[]>;

        pullModel(model: string): Promise<void>;

        warmupModel(model: string): Promise<void>;
    }

    interface WinkyResultAPI {
        open(): Promise<void>;

        close(): Promise<void>;

        update(data: { transcription?: string; llmResponse?: string; isStreaming?: boolean }): Promise<void>;

        subscribe(callback: (data: {
            transcription?: string;
            llmResponse?: string;
            isStreaming?: boolean
        }) => void): () => void;
    }

    interface WinkyActionHotkeysAPI {
        register(hotkeys: Array<{ id: string; accelerator: string }>): Promise<void>;

        clear(): Promise<void>;
    }

    interface WinkyHistoryAPI {
        get(): Promise<ActionHistoryEntry[]>;

        add(payload: {
            action_id: string;
            action_name: string;
            action_prompt?: string | null;
            transcription: string;
            llm_response?: string | null;
            result_text: string;
            audio_path?: string | null;
        }): Promise<ActionHistoryEntry>;

        saveAudio(audioData: ArrayBuffer, mimeType?: string): Promise<string>;

        readAudio(audioPath: string): Promise<Uint8Array>;

        clear(): Promise<void>;

        subscribe(callback: (event: { type: 'added'; entry: ActionHistoryEntry } | { type: 'cleared' }) => void): () => void;
    }

    interface WinkyNotesAPI {
        get(page?: number, pageSize?: number): Promise<{
            count: number;
            next_page: number | null;
            previous_page: number | null;
            results: WinkyNote[];
        }>;

        create(payload: { title: string; description?: string }): Promise<WinkyNote>;

        update(payload: { id: string; title?: string; description?: string }): Promise<WinkyNote>;

        delete(id: string): Promise<void>;

        bulkDelete(ids: string[]): Promise<{deleted_count: number}>;

        subscribe(callback: (event: { type: 'added'; entry: WinkyNote } | {
            type: 'updated';
            entry: WinkyNote
        } | { type: 'deleted'; id: string } | { type: 'bulk-deleted'; ids: string[] }) => void): () => void;
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
        ollama: WinkyOllamaAPI;
        result: WinkyResultAPI;
        windows: WinkyWindowsAPI;
        notifications: WinkyNotificationsAPI;
        windowControls: WinkyWindowControlsAPI;
        mic: WinkyMicAPI;
        actionHotkeys: WinkyActionHotkeysAPI;
        history: WinkyHistoryAPI;
        notes: WinkyNotesAPI;

        on(channel: string, callback: (...args: any[]) => void): () => void;

        removeListener(channel: string, callback: (...args: any[]) => void): void;
    }

    interface Window {
        winky?: WinkyPreload;
    }
}

export {};
