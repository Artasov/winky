import {useCallback} from 'react';
import {LLM_MODES, SPEECH_MODES} from '@shared/constants';
import type {AppConfig} from '@shared/types';
import {getLocalSpeechModelMetadata} from '../../../services/localSpeechModels';
import {normalizeOllamaModelName} from '../../../services/ollama';
import {
    isGeminiApiModel,
    isGoogleTranscribeModel,
    isOpenAiApiModel,
    isOpenAiTranscribeModel
} from '../../../utils/modelFormatters';
import {localSpeechBridge, micBridge, ollamaBridge} from '../../../services/winkyBridge';

type ToastFn = (message: string, type?: 'success' | 'info' | 'error', options?: {durationMs?: number}) => void;

type UseSpeechServiceReadinessParams = {
    config: AppConfig | null;
    localModelWarmingUp: boolean;
    localLlmDownloading: boolean;
    localLlmWarmingUp: boolean;
    openMainWindowWithToast: (message: string) => Promise<void>;
    showToast: ToastFn;
    isMicOverlay: boolean;
};

export const useSpeechServiceReadiness = ({
    config,
    localModelWarmingUp,
    localLlmDownloading,
    localLlmWarmingUp,
    openMainWindowWithToast,
    showToast,
    isMicOverlay
}: UseSpeechServiceReadinessParams) => {
    const ensureApiKeysReady = useCallback(async (): Promise<boolean> => {
        if (!config) {
            return false;
        }

        const googleKey = config.apiKeys.google?.trim() ?? '';
        const openaiKey = config.apiKeys.openai?.trim() ?? '';

        if (config.speech.mode === SPEECH_MODES.API) {
            const speechModel = config.speech.model;
            if (isOpenAiTranscribeModel(speechModel) && !openaiKey) {
                const message = 'Add your OpenAI key to use the selected speech model.';
                await openMainWindowWithToast(message);
                showToast(message, 'error', {durationMs: 6000});
                if (isMicOverlay) {
                    void micBridge.hide({reason: 'missing-openai-key'});
                }
                return false;
            }
            if (isGoogleTranscribeModel(speechModel) && !googleKey) {
                const message = 'Add your Google key to use the selected speech model.';
                await openMainWindowWithToast(message);
                showToast(message, 'error', {durationMs: 6000});
                if (isMicOverlay) {
                    void micBridge.hide({reason: 'missing-google-key'});
                }
                return false;
            }
        }

        if (config.llm.mode === LLM_MODES.API) {
            const llmModel = config.llm.model;
            if (isOpenAiApiModel(llmModel) && !openaiKey) {
                const message = 'Add your OpenAI key to use the selected LLM model.';
                await openMainWindowWithToast(message);
                showToast(message, 'error', {durationMs: 6000});
                if (isMicOverlay) {
                    void micBridge.hide({reason: 'missing-openai-key'});
                }
                return false;
            }
            if (isGeminiApiModel(llmModel) && !googleKey) {
                const message = 'Add your Google key to use the selected LLM model.';
                await openMainWindowWithToast(message);
                showToast(message, 'error', {durationMs: 6000});
                if (isMicOverlay) {
                    void micBridge.hide({reason: 'missing-google-key'});
                }
                return false;
            }
        }

        return true;
    }, [config, openMainWindowWithToast, isMicOverlay, showToast]);

    const ensureLocalSpeechReady = useCallback(async (): Promise<boolean> => {
        if (config?.speech.mode !== SPEECH_MODES.LOCAL) {
            return true;
        }
        
        // Проверяем, запущен ли локальный сервер
        try {
            const status = await localSpeechBridge.checkHealth();
            if (!status.running) {
                const message = 'Local speech server is not running. Start the server in Settings before using the microphone.';
                await openMainWindowWithToast(message);
                showToast(message, 'error', {durationMs: 6000});
                if (isMicOverlay) {
                    void micBridge.hide({reason: 'local-server-not-running'});
                }
                return false;
            }
        } catch (error) {
            const message = 'Local speech server is not available. Start the server in Settings before using the microphone.';
            await openMainWindowWithToast(message);
            showToast(message, 'error', {durationMs: 6000});
            if (isMicOverlay) {
                void micBridge.hide({reason: 'local-server-error'});
            }
            return false;
        }
        
        const model = config.speech.model;
        const isDownloaded = await localSpeechBridge.isModelDownloaded(model);
        if (!isDownloaded) {
            const message = `Download the ${model} model before using the microphone.`;
            await openMainWindowWithToast(message);
            return false;
        }
        if (localModelWarmingUp) {
            const metadata = getLocalSpeechModelMetadata(model);
            const label = metadata ? `${metadata.label} (${metadata.size})` : model;
            const message = `Model ${label} is warming up. Please wait before using the microphone.`;
            await openMainWindowWithToast(message);
            return false;
        }
        return true;
    }, [config?.speech.mode, config?.speech.model, localModelWarmingUp, openMainWindowWithToast, showToast, isMicOverlay]);

    const ensureLocalLlmReady = useCallback(async (): Promise<boolean> => {
        if (config?.llm.mode !== LLM_MODES.LOCAL) {
            return true;
        }
        const model = config.llm.model;

        if (localLlmDownloading) {
            const message = `The ${model} LLM model is downloading via Ollama. Please wait until it completes.`;
            await openMainWindowWithToast(message);
            return false;
        }
        if (localLlmWarmingUp) {
            const message = `The ${model} LLM model is warming up. Please wait before using the microphone.`;
            await openMainWindowWithToast(message);
            return false;
        }

        try {
            const isDownloaded = await ollamaBridge.checkInstalled().then((installed) => {
                if (!installed) {
                    throw new Error('Ollama is not running. Start Ollama and try again.');
                }
                return ollamaBridge
                    .listModels(true)
                    .then((models) => models.includes(normalizeOllamaModelName(model)));
            });
            if (!isDownloaded) {
                const message = `Download the ${model} LLM model before using the microphone.`;
                await openMainWindowWithToast(message);
                if (isMicOverlay) {
                    void micBridge.hide({reason: 'ollama-not-ready'});
                }
                return false;
            }
        } catch (error) {
            console.error('[useSpeechServiceReadiness] Failed to check ollama model:', error);
            const errorMessage =
                error instanceof Error ? error.message : 'Failed to check Ollama model. Make sure Ollama is running.';
            await openMainWindowWithToast(errorMessage);
            if (isMicOverlay) {
                void micBridge.hide({reason: 'ollama-error'});
            }
            return false;
        }

        return true;
    }, [
        config?.llm.mode,
        config?.llm.model,
        localLlmDownloading,
        localLlmWarmingUp,
        openMainWindowWithToast,
        isMicOverlay
    ]);

    const ensureSpeechService = useCallback(async (): Promise<boolean> => {
        if (!config) {
            showToast('Recording service is unavailable.', 'error');
            return false;
        }

        const apiKeysReady = await ensureApiKeysReady();
        if (!apiKeysReady) {
            return false;
        }

        const speechReady = await ensureLocalSpeechReady();
        if (!speechReady) {
            return false;
        }

        return await ensureLocalLlmReady();


    }, [config, ensureApiKeysReady, ensureLocalSpeechReady, ensureLocalLlmReady, showToast]);

    return {
        ensureSpeechService
    };
};
