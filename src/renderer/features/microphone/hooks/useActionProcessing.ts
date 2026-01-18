import {useCallback, type RefObject} from 'react';
import type {ActionConfig, AppConfig} from '@shared/types';
import {createNoteForMode, deriveNoteTitle, resolveNotesStorageMode} from '../../../services/notesService';
import {clipboardBridge, historyBridge, llmBridge, resourcesBridge, resultBridge, speechBridge} from '../../../services/winkyBridge';

type ToastFn = (message: string, type?: 'success' | 'info' | 'error', options?: { durationMs?: number }) => void;

const TRANSCRIBE_UI_TIMEOUT_MS = 120_000;
const TRANSCRIBE_SLOW_LOG_MS = 15_000;

type UseActionProcessingParams = {
    config: AppConfig | null;
    showToast: ToastFn;
    handleLocalSpeechServerFailure: (message?: string) => boolean;
    openMainWindowWithToast: (message: string) => Promise<void>;
    completionSoundRef: RefObject<HTMLAudioElement | null>;
    contextTextRef: React.MutableRefObject<string>;
};

export const useActionProcessing = ({
                                        config,
                                        showToast,
                                        handleLocalSpeechServerFailure,
                                        openMainWindowWithToast,
                                        completionSoundRef,
                                        contextTextRef
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
        
        const recordHistory = async (payload: {
            action_id: string;
            action_name: string;
            action_prompt?: string | null;
            transcription: string;
            llm_response?: string | null;
            result_text: string;
        }) => {
            try {
                await historyBridge.add(payload);
            } catch (error) {
                console.warn('[useActionProcessing] Failed to save history', error);
            }
        };

        const isQuickNoteAction = Boolean(action.is_default) && action.name === 'Quick note';
        const completionAction = action;

        const saveQuickNote = async (text: string) => {
            if (!isQuickNoteAction) {
                return;
            }
            const trimmed = text.trim();
            if (!trimmed) {
                return;
            }
            try {
                const mode = resolveNotesStorageMode(config);
                await createNoteForMode(mode, {
                    title: deriveNoteTitle(trimmed),
                    description: trimmed
                });
            } catch (error) {
                console.warn('[useActionProcessing] Failed to save quick note', error);
                showToast('Failed to save the note.', 'error');
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

            const contextText = contextTextRef.current?.trim() || '';
            const llmInput = contextText
                ? `${transcription}\n\nAdditional context:\n${contextText}`.trim()
                : transcription;

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
                await recordHistory({
                    action_id: action.id,
                    action_name: action.name,
                    action_prompt: action.prompt?.trim() || null,
                    transcription,
                    llm_response: null,
                    result_text: transcription
                });
                await saveQuickNote(transcription);
                await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef});
                return;
            }

            const llmConfig = {
                mode: config.llm.mode,
                model: config.llm.model,
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: authToken
            };

            let streamedResponse = '';
            const onChunk = action.show_results
                ? (chunk: string) => {
                    streamedResponse += chunk;
                    void resultBridge.update({llmResponse: streamedResponse, isStreaming: true});
                }
                : undefined;

            // Используем объединенный запрос (транскрипция + текст из поля) для LLM
            const llmPrompt = action.prompt?.trim() || undefined;

            const response = await llmBridge.process(
                llmInput,
                llmPrompt,
                llmConfig,
                onChunk ? {onChunk} : undefined
            );

            const finalResponse = response?.trim().length ? response : streamedResponse;

            if (action.show_results) {
                await resultBridge.update({llmResponse: finalResponse, isStreaming: false});
            }

            if (action.auto_copy_result) {
                await copyWithRetries({
                    text: finalResponse ?? '',
                    showToast,
                    successMessage: 'Response copied.',
                    failureMessage: 'Failed to copy the response to the clipboard.'
                });
            }

            const trimmedResponse = finalResponse?.trim() || '';
            await recordHistory({
                action_id: action.id,
                action_name: action.name,
                action_prompt: action.prompt?.trim() || null,
                transcription,
                llm_response: finalResponse ?? null,
                result_text: trimmedResponse.length > 0 ? finalResponse : transcription
            });
            await saveQuickNote(trimmedResponse.length > 0 ? finalResponse ?? '' : transcription);
            await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef, debug: true});
        } catch (error: any) {
            console.error(error);

            let errorMessage = 'An error occurred while processing the action.';

            if (error?.response?.status === 401) {
                const errorData = error?.response?.data?.error;
                if (errorData?.message) {
                    if (errorData.message.includes('API key')) {
                        const hasGoogleKey = !!config?.apiKeys.google?.trim();
                        const hasOpenAiKey = !!config?.apiKeys.openai?.trim();
                        if (error.message?.includes('Google') || error.message?.includes('Gemini')) {
                            errorMessage = hasOpenAiKey
                                ? 'Google API key is missing or invalid. Switch to OpenAI models or Local mode, or add Google key in Settings.'
                                : 'Google API key is missing or invalid. Switch to Local mode or add API key in Settings.';
                        } else {
                            errorMessage = hasGoogleKey
                                ? 'OpenAI API key is missing or invalid. Switch to Google models or Local mode, or add OpenAI key in Settings.'
                                : 'OpenAI API key is missing or invalid. Switch to Local mode or add API key in Settings.';
                        }
                    } else {
                        errorMessage = `Authentication error: ${errorData.message}`;
                    }
                } else {
                    errorMessage = 'API authentication error. Check your API keys in Settings or switch to Local mode.';
                }
            } else if (error?.response?.status) {
                const errorData = error?.response?.data?.error;
                if (errorData?.message) {
                    errorMessage = `API error: ${errorData.message}`;
                } else {
                    errorMessage = `Request error (status ${error.response.status})`;
                }
            } else if (error?.message) {
                // Улучшаем сообщения об ошибках связанных с ключами
                if (error.message.includes('API key') || error.message.includes('key')) {
                    const hasGoogleKey = !!config?.apiKeys.google?.trim();
                    const hasOpenAiKey = !!config?.apiKeys.openai?.trim();
                    if (error.message.includes('Google') || error.message.includes('Gemini')) {
                        errorMessage = hasOpenAiKey
                            ? 'Google API key is missing. Switch to OpenAI models or Local mode, or add Google key in Settings.'
                            : 'Google API key is missing. Switch to Local mode or add API key in Settings.';
                    } else if (error.message.includes('OpenAI')) {
                        errorMessage = hasGoogleKey
                            ? 'OpenAI API key is missing. Switch to Google models or Local mode, or add OpenAI key in Settings.'
                            : 'OpenAI API key is missing. Switch to Local mode or add API key in Settings.';
                    } else {
                        errorMessage = error.message;
                    }
                } else {
                    errorMessage = error.message;
                }
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
    }, [config, showToast, handleLocalSpeechServerFailure, openMainWindowWithToast, completionSoundRef, contextTextRef]);

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
    const completionSoundEnabled = config?.completionSoundEnabled !== false;
    const volumePreference = config?.completionSoundVolume ?? 1.0;
    
    if (!action.sound_on_complete || !completionSoundEnabled || !(volumePreference > 0)) {
        if (debug) {
            console.warn('[useActionProcessing] Sound playback skipped:', {
                sound_on_complete: action.sound_on_complete,
                completionSoundEnabled,
                volumePreference
            });
        }
        return;
    }
    
    const audio = audioRef.current;
    
    // Сначала пробуем HTML Audio API (поддерживает громкость)
    if (audio && audio.src) {
        audio.volume = volumePreference;
        try {
            audio.currentTime = 0;
        } catch {
            /* ignore */
        }
        
        const playHtmlAudio = (): Promise<boolean> => new Promise((resolve) => {
            const onSuccess = () => {
                if (debug) {
                    console.log('[useActionProcessing] Sound played via HTML Audio, volume:', volumePreference);
                }
                resolve(true);
            };
            const onError = (error: unknown) => {
                if (debug) {
                    console.warn('[useActionProcessing] HTML Audio failed:', error);
                }
                resolve(false);
            };
            
            if (audio.readyState >= 2) {
                audio.play().then(onSuccess).catch(onError);
            } else {
                audio.load();
                audio.addEventListener('canplay', () => {
                    audio.play().then(onSuccess).catch(onError);
                }, {once: true});
                audio.addEventListener('error', () => onError('load error'), {once: true});
                // Таймаут на случай если аудио не загрузится
                setTimeout(() => onError('timeout'), 3000);
            }
        });
        
        const htmlSuccess = await playHtmlAudio();
        if (htmlSuccess) {
            return;
        }
    }
    
    // Fallback на native API (не поддерживает громкость, но работает без прав админа)
    if (debug) {
        console.log('[useActionProcessing] Falling back to native API (volume not supported)');
    }
    try {
        await resourcesBridge.playSound('completion.wav');
        if (debug) {
            console.log('[useActionProcessing] Sound played via native API');
        }
    } catch (nativeError) {
        console.error('[useActionProcessing] Both HTML Audio and native API failed:', nativeError);
    }
};
