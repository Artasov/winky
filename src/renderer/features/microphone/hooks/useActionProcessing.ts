import {useCallback, type RefObject} from 'react';
import type {ActionConfig, AppConfig} from '@shared/types';
import {clipboardBridge, llmBridge, resultBridge, speechBridge} from '../../../services/winkyBridge';

type ToastFn = (message: string, type?: 'success' | 'info' | 'error', options?: { durationMs?: number }) => void;

const TRANSCRIBE_UI_TIMEOUT_MS = 120_000;
const TRANSCRIBE_SLOW_LOG_MS = 15_000;

type UseActionProcessingParams = {
    config: AppConfig | null;
    showToast: ToastFn;
    handleLocalSpeechServerFailure: (message?: string) => boolean;
    openMainWindowWithToast: (message: string) => Promise<void>;
    completionSoundRef: RefObject<HTMLAudioElement | null>;
};

export const useActionProcessing = ({
                                        config,
                                        showToast,
                                        handleLocalSpeechServerFailure,
                                        openMainWindowWithToast,
                                        completionSoundRef
                                    }: UseActionProcessingParams) => {
    const processAction = useCallback(async (action: ActionConfig, blob: Blob) => {
        if (!config) {
            return;
        }
        let abortController: AbortController | null = null;
        let slowLogTimer: number | null = null;
        const startTime = Date.now();
        
        const clearSlowLogTimer = () => {
            if (slowLogTimer !== null) {
                clearTimeout(slowLogTimer);
                slowLogTimer = null;
            }
        };
        
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const authToken = config.auth.access || config.auth.accessToken || undefined;

            const transcriptionPrompt = action.prompt_recognizing?.trim() || undefined;

            abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
            slowLogTimer =
                typeof window !== 'undefined'
                    ? window.setTimeout(() => {
                        console.warn('[useActionProcessing] Transcription still in-flight', {
                            mode: config.speech.mode,
                            model: config.speech.model,
                            actionId: action.id,
                            elapsedMs: Date.now() - startTime
                        });
                    }, TRANSCRIBE_SLOW_LOG_MS)
                    : null;

            console.log('[useActionProcessing] Starting transcription request', {
                mode: config.speech.mode,
                model: config.speech.model,
                audioSizeKB: (arrayBuffer.byteLength / 1024).toFixed(2)
            });

            const transcription = await speechBridge.transcribe(arrayBuffer, {
                mode: config.speech.mode,
                model: config.speech.model,
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: authToken,
                prompt: transcriptionPrompt
            }, {
                signal: abortController?.signal,
                uiTimeoutMs: TRANSCRIBE_UI_TIMEOUT_MS
            });

            clearSlowLogTimer();
            
            const elapsedMs = Date.now() - startTime;
            console.log('[useActionProcessing] Transcription completed', {
                elapsedMs,
                hasResult: !!transcription,
                resultLength: transcription?.length ?? 0
            });

            if (!transcription) {
                showToast('Failed to transcribe speech for the action.', 'error');
                return;
            }

            const needsLLM = Boolean(action.prompt && action.prompt.trim());

            if (action.show_results) {
                await resultBridge.open();
                await resultBridge.update({
                    transcription,
                    llmResponse: needsLLM ? '' : transcription,
                    isStreaming: needsLLM
                });
            }

            if (!needsLLM) {
                if (action.auto_copy_result) {
                    await copyWithRetries({
                        text: transcription,
                        showToast,
                        successMessage: 'Result copied.',
                        failureMessage: 'Failed to copy the result to the clipboard.'
                    });
                }
                await playCompletionSound({action, config, audioRef: completionSoundRef});
                return;
            }

            const llmConfig = {
                mode: config.llm.mode,
                model: config.llm.model,
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: authToken
            };

            const response = await llmBridge.process(transcription, action.prompt, llmConfig);

            if (action.show_results) {
                await resultBridge.update({llmResponse: response, isStreaming: false});
            }

            if (action.auto_copy_result) {
                await copyWithRetries({
                    text: response ?? '',
                    showToast,
                    successMessage: 'Response copied.',
                    failureMessage: 'Failed to copy the response to the clipboard.'
                });
            }

            await playCompletionSound({action, config, audioRef: completionSoundRef, debug: true});
        } catch (error: any) {
            console.error(error);

            let errorMessage = 'An error occurred while processing the action.';

            if (error?.response?.status === 401) {
                const errorData = error?.response?.data?.error;
                if (errorData?.message) {
                    if (errorData.message.includes('API key')) {
                        errorMessage = 'The OpenAI API key is missing or invalid. Check your settings.';
                    } else {
                        errorMessage = `Authentication error: ${errorData.message}`;
                    }
                } else {
                    errorMessage = 'OpenAI authentication error. Check the API key in settings.';
                }
            } else if (error?.response?.status) {
                const errorData = error?.response?.data?.error;
                if (errorData?.message) {
                    errorMessage = `API error: ${errorData.message}`;
                } else {
                    errorMessage = `Request error (status ${error.response.status})`;
                }
            } else if (error?.message) {
                errorMessage = error.message;
            }

            if (!handleLocalSpeechServerFailure(errorMessage)) {
                await openMainWindowWithToast(errorMessage);
            }
        } finally {
            clearSlowLogTimer();
            // Отменяем запрос, если он еще в процессе
            if (abortController && !abortController.signal.aborted) {
                abortController.abort();
            }
        }
    }, [config, showToast, handleLocalSpeechServerFailure, openMainWindowWithToast, completionSoundRef]);

    return {processAction};
};

type CopyWithRetriesParams = {
    text: string;
    showToast: ToastFn;
    successMessage: string;
    failureMessage: string;
};

const copyWithRetries = async ({
                                   text,
                                   showToast,
                                   successMessage,
                                   failureMessage
                               }: CopyWithRetriesParams): Promise<boolean> => {
    const payload = text?.trim() ?? '';
    if (!payload) {
        console.warn('[useActionProcessing] Nothing to copy, skipping clipboard write');
        return false;
    }
    const delays = [0, 100, 200];
    for (const delay of delays) {
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const copied = await clipboardBridge.writeText(payload);
        if (copied) {
            showToast(successMessage, 'success');
            return true;
        }
    }
    console.error('[useActionProcessing] Failed to copy text to clipboard after retries');
    showToast(failureMessage, 'error');
    return false;
};

type PlayCompletionSoundParams = {
    action: ActionConfig;
    config: AppConfig | null;
    audioRef: RefObject<HTMLAudioElement | null>;
    debug?: boolean;
};

const playCompletionSound = async ({
                                       action,
                                       config,
                                       audioRef,
                                       debug = false
                                   }: PlayCompletionSoundParams): Promise<void> => {
    const audio = audioRef.current;
    const completionSoundEnabled = config?.completionSoundEnabled !== false;
    const volumePreference = config?.completionSoundVolume ?? 1.0;
    if (debug) {
        console.log('[useActionProcessing] Checking sound playback:', {
            sound_on_complete: action.sound_on_complete,
            hasAudio: !!audio,
            audioSrc: audio?.src,
            audioReadyState: audio?.readyState,
            completionSoundEnabled,
            volumePreference
        });
    }
    if (!action.sound_on_complete || !audio || !completionSoundEnabled) {
        if (debug) {
            console.warn('[useActionProcessing] Sound playback skipped:', {
                sound_on_complete: action.sound_on_complete,
                hasAudio: !!audio,
                completionSoundEnabled
            });
        }
        return;
    }
    if (!(volumePreference > 0) || !audio.src) {
        if (debug) {
            console.warn('[useActionProcessing] Cannot play sound due to missing volume or source:', {
                volumePreference,
                hasSrc: !!audio.src
            });
        }
        return;
    }
    audio.volume = volumePreference;
    try {
        audio.currentTime = 0;
    } catch {
        /* ignore */
    }
    const play = () => audio.play().catch((error) => {
        console.error('[useActionProcessing] Error playing completion sound:', error);
    });
    if (audio.readyState >= 2) {
        if (debug) {
            console.log('[useActionProcessing] Audio ready, playing immediately');
        }
        await play();
    } else {
        if (debug) {
            console.log('[useActionProcessing] Audio not ready, loading before play');
        }
        audio.load();
        audio.addEventListener(
            'canplay',
            () => {
                void play();
            },
            {once: true}
        );
    }
};
