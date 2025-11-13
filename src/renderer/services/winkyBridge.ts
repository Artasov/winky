export type ResultPayload = {
    transcription?: string;
    llmResponse?: string;
    isStreaming?: boolean;
};

export type ResultUnsubscribe = () => void;

const noop: ResultUnsubscribe = () => undefined;

export const resultBridge = {
    subscribe(listener: (payload: ResultPayload) => void): ResultUnsubscribe {
        return window.winky?.result?.onData?.(listener) ?? noop;
    },
    open(): Promise<void> {
        return window.winky?.result?.open?.() ?? Promise.resolve();
    },
    close(): Promise<void> {
        return window.winky?.result?.close?.() ?? Promise.resolve();
    },
    update(data: ResultPayload): Promise<void> {
        return window.winky?.result?.update?.(data) ?? Promise.resolve();
    }
};

export const clipboardBridge = {
    writeText(text: string): Promise<boolean> {
        return window.winky?.clipboard?.writeText?.(text) ?? Promise.resolve(false);
    }
};

type SpeechTranscribeConfig = {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
    prompt?: string;
};

type LlmProcessConfig = {
    mode: string;
    model: string;
    openaiKey?: string;
    googleKey?: string;
    geminiKey?: string;
    accessToken?: string;
};

export const speechBridge = {
    transcribe(audioData: ArrayBuffer, config: SpeechTranscribeConfig): Promise<string> {
        if (!window.winky?.speech?.transcribe) {
            return Promise.reject(new Error('Speech API недоступен.'));
        }
        return window.winky.speech.transcribe(audioData, config);
    }
};

export const llmBridge = {
    process(text: string, prompt: string, config: LlmProcessConfig): Promise<string> {
        if (!window.winky?.llm?.process) {
            return Promise.reject(new Error('LLM API недоступен.'));
        }
        return window.winky.llm.process(text, prompt, config);
    }
};

export const micBridge = {
    hide(options?: { reason?: string; disableAutoShow?: boolean }): Promise<void> {
        return window.winky?.mic?.hide?.(options) ?? Promise.resolve();
    }
};

export const windowBridge = {
    openSettings(): Promise<void> {
        if (!window.winky?.windows?.openSettings) {
            return Promise.reject(new Error('Settings window bridge unavailable'));
        }
        return window.winky.windows.openSettings();
    },
    navigate(path: string): Promise<void> {
        return window.winky?.windows?.navigate?.(path) ?? Promise.resolve();
    }
};

export const notificationBridge = {
    showToast(
        message: string,
        type: 'success' | 'info' | 'error' = 'info',
        options?: { durationMs?: number }
    ): Promise<void> {
        return window.winky?.notifications?.showToast?.(message, type, options) ?? Promise.resolve();
    }
};

export const actionHotkeysBridge = {
    register(hotkeys: Array<{ id: string; accelerator: string }>): Promise<void> {
        return window.winky?.actionHotkeys?.register?.(hotkeys) ?? Promise.resolve();
    },
    clear(): Promise<void> {
        return window.winky?.actionHotkeys?.clear?.() ?? Promise.resolve();
    }
};
