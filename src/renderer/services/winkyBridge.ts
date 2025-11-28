// Экспортируем тип из менеджера окон
import type {ResultPayload} from '@renderer/services/windows';
export type {ResultPayload} from './windows/ResultWindowManager';

export type ResultUnsubscribe = () => void;

const noop: ResultUnsubscribe = () => undefined;

export const resultBridge = {
    subscribe(listener: (payload: ResultPayload) => void): ResultUnsubscribe {
        const unsubscribe = window.winky?.result?.onData?.(listener) ?? noop;
        const snapshot = window.winky?.result?.getState?.();
        if (snapshot) {
            Promise.resolve().then(() => listener(snapshot));
        }
        return unsubscribe;
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
    accessToken?: string;
};

export const speechBridge = {
    transcribe(audioData: ArrayBuffer, config: SpeechTranscribeConfig): Promise<string> {
        if (!window.winky?.speech?.transcribe) {
            return Promise.reject(new Error('Speech API is unavailable.'));
        }
        return window.winky.speech.transcribe(audioData, config);
    }
};

export const llmBridge = {
    process(text: string, prompt: string, config: LlmProcessConfig): Promise<string> {
        if (!window.winky?.llm?.process) {
            return Promise.reject(new Error('LLM API is unavailable.'));
        }
        return window.winky.llm.process(text, prompt, config);
    }
};

export const micBridge = {
    hide(options?: { reason?: string; disableAutoShow?: boolean }): Promise<void> {
        return window.winky?.mic?.hide?.(options) ?? Promise.resolve();
    },
    show(reason?: string): Promise<void> {
        return window.winky?.mic?.show?.(reason) ?? Promise.resolve();
    },
    toggle(reason?: string): Promise<void> {
        return window.winky?.mic?.toggle?.(reason) ?? Promise.resolve();
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
    },
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

export const resourcesBridge = {
    async getSoundPath(soundName: string): Promise<string> {
        const result = await window.winky?.resources?.getSoundPath?.(soundName);
        return result ?? '';
    },
    async getSoundData(soundName: string): Promise<Uint8Array | null> {
        try {
            const result = await window.winky?.resources?.getSoundData?.(soundName);
            return result ?? null;
        } catch (error) {
            console.warn('[resourcesBridge] Failed to get sound data:', error);
            return null;
        }
    }
};

export const localSpeechBridge = {
    getStatus(): Promise<any> {
        return window.winky?.localSpeech?.getStatus?.() ?? Promise.reject(new Error('Local speech API unavailable.'));
    },
    checkHealth(): Promise<any> {
        return window.winky?.localSpeech?.checkHealth?.() ?? Promise.reject(new Error('Local speech API unavailable.'));
    },
    isModelDownloaded(model: string): Promise<boolean> {
        return window.winky?.localSpeech?.isModelDownloaded?.(model) ?? Promise.resolve(false);
    },
    install(targetDir?: string): Promise<any> {
        return window.winky?.localSpeech?.install?.(targetDir) ?? Promise.reject(new Error('Local speech API unavailable.'));
    },
    start(): Promise<any> {
        return window.winky?.localSpeech?.start?.() ?? Promise.reject(new Error('Local speech API unavailable.'));
    },
    restart(): Promise<any> {
        return window.winky?.localSpeech?.restart?.() ?? Promise.reject(new Error('Local speech API unavailable.'));
    },
    reinstall(targetDir?: string): Promise<any> {
        return window.winky?.localSpeech?.reinstall?.(targetDir) ?? Promise.reject(new Error('Local speech API unavailable.'));
    },
    stop(): Promise<any> {
        return window.winky?.localSpeech?.stop?.() ?? Promise.reject(new Error('Local speech API unavailable.'));
    },
    onStatus(callback: (status: any) => void): () => void {
        return window.winky?.localSpeech?.onStatus?.(callback) ?? (() => {});
    }
};

export const ollamaBridge = {
    checkInstalled(): Promise<boolean> {
        return window.winky?.ollama?.checkInstalled?.() ?? Promise.resolve(false);
    },
    listModels(force?: boolean): Promise<string[]> {
        return window.winky?.ollama?.listModels?.(force) ?? Promise.resolve([]);
    },
    pullModel(model: string): Promise<void> {
        return window.winky?.ollama?.pullModel?.(model) ?? Promise.resolve();
    },
    warmupModel(model: string): Promise<void> {
        return window.winky?.ollama?.warmupModel?.(model) ?? Promise.resolve();
    }
};
