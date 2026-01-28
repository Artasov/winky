import {useCallback, type RefObject} from 'react';
import type {ActionConfig, AppConfig} from '@shared/types';
import {LLM_WINKY_API_MODELS, SPEECH_WINKY_API_MODELS} from '@shared/constants';
import {createNoteForMode, deriveNoteTitle, resolveNotesStorageMode} from '../../../services/notesService';
import {clipboardBridge, historyBridge, llmBridge, resourcesBridge, speechBridge} from '../../../services/winkyBridge';
import {resultPageBridge} from '../../../services/resultPageBridge';
import {trimSilenceFromAudioBlob, isAudioSilent} from '../services/audioProcessing';
import {winkyTranscribe, winkyLLMStream} from '../../../services/winkyAiApi';

const WINKY_LLM_MODELS_SET = new Set<string>([...LLM_WINKY_API_MODELS]);
const WINKY_SPEECH_MODELS_SET = new Set<string>([...SPEECH_WINKY_API_MODELS]);

const isWinkyLLMModel = (model: string): boolean => WINKY_LLM_MODELS_SET.has(model);
const isWinkySpeechModel = (model: string): boolean => WINKY_SPEECH_MODELS_SET.has(model);

type ToastFn = (message: string, type?: 'success' | 'info' | 'error', options?: { durationMs?: number }) => void;

const TRANSCRIBE_UI_TIMEOUT_MS = 120_000;
const TRANSCRIBE_SLOW_LOG_MS = 15_000;

// Известные галлюцинации/артефакты Whisper при тихом/шумном аудио
const KNOWN_WHISPER_HALLUCINATIONS = [
    'hostname, and email are included in the link below.',
    'like and subscribe',
    'امیدوارم که این ویدیو',
    'ご視聴ありがとうございました',
    '字幕by',
    'subtitle by',
    'transcript by',
    'captioning by',
    'www.mooji.org',
];

// Проверяет, является ли текст валидной транскрипцией или артефактом
const isValidTranscription = (text: string, prompt?: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }

    const normalizedText = trimmed.toLowerCase();

    // 1. Проверяем на известные галлюцинации Whisper
    for (const hallucination of KNOWN_WHISPER_HALLUCINATIONS) {
        const normalizedHallucination = hallucination.toLowerCase();
        if (normalizedText === normalizedHallucination ||
            normalizedText.includes(normalizedHallucination) ||
            normalizedHallucination.includes(normalizedText)) {
            console.warn('[useActionProcessing] Known Whisper hallucination detected:', trimmed);
            return false;
        }
    }

    // 2. Проверяем, не является ли результат копией промпта
    if (prompt?.trim()) {
        const normalizedPrompt = prompt.trim().toLowerCase();
        // Если результат содержит более 70% текста промпта, вероятно это галлюцинация
        if (normalizedText.includes(normalizedPrompt) || normalizedPrompt.includes(normalizedText)) {
            const similarity = normalizedText.length / normalizedPrompt.length;
            if (similarity > 0.7) {
                console.warn('[useActionProcessing] Transcription looks like prompt repetition:', trimmed);
                return false;
            }
        }
    }

    // 3. Проверяем на подозрительные паттерны
    // Только иероглифы/китайские символы (если язык не китайский)
    const chineseChars = trimmed.match(/[\u4e00-\u9fff]/g);
    const chineseRatio = chineseChars ? chineseChars.length / trimmed.length : 0;
    if (chineseRatio > 0.8) {
        console.warn('[useActionProcessing] Transcription is mostly Chinese characters (possible hallucination):', trimmed);
        return false;
    }

    // 4. Только арабские символы (если язык не арабский)
    const arabicChars = trimmed.match(/[\u0600-\u06ff]/g);
    const arabicRatio = arabicChars ? arabicChars.length / trimmed.length : 0;
    if (arabicRatio > 0.8) {
        console.warn('[useActionProcessing] Transcription is mostly Arabic characters (possible hallucination):', trimmed);
        return false;
    }

    // 5. Очень короткие результаты (менее 2 символов) могут быть артефактами
    if (trimmed.length < 2) {
        console.warn('[useActionProcessing] Transcription too short (possible artifact):', trimmed);
        return false;
    }

    return true;
};

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

        const clearContext = () => {
            contextTextRef.current = '';
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('mic:clear-context'));
            }
        };
        
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
            audio_path?: string | null;
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
            const shouldTrimSilence = config.trimSilenceOnActions === true;
            const shouldSaveAudio = config.saveAudioHistory === true;
            let audioData: ArrayBuffer;
            let mimeType = blob.type || 'audio/webm';
            let audioForSave: ArrayBuffer | null = null;
            let saveMimeType: string | undefined = undefined;
            let isSilent = false;

            if (shouldTrimSilence) {
                const trimmed = await trimSilenceFromAudioBlob(blob, {
                    thresholdRatio: 0.05,
                    minThreshold: 0.01,
                    paddingMs: 300,
                    minSegmentMs: 80
                });
                audioData = trimmed.audioData;
                mimeType = trimmed.mimeType;
                isSilent = trimmed.isSilent;
                if (shouldSaveAudio) {
                    audioForSave = trimmed.audioData;
                    saveMimeType = trimmed.mimeType;
                }
            } else {
                // Проверяем на тишину даже если trimSilence отключен
                isSilent = await isAudioSilent(blob);
                const originalAudioData = await blob.arrayBuffer();
                audioData = originalAudioData;
                if (shouldSaveAudio) {
                    audioForSave = originalAudioData;
                    saveMimeType = mimeType;
                }
            }

            // Проверяем наличие контекста ДО блокировки из-за тишины
            const contextText = contextTextRef.current?.trim() || '';
            const hasContext = contextText.length > 0;

            // Если аудио тихое и нет контекста, не выполняем действие
            if (isSilent && !hasContext) {
                console.log('[useActionProcessing] Audio is silent and no context provided, skipping action');
                showToast('No speech detected in the recording.', 'info');
                return;
            }

            // Если есть контекст, но аудио тихое - пропускаем распознавание речи
            const shouldSkipTranscription = isSilent && hasContext;
            if (shouldSkipTranscription) {
                console.log('[useActionProcessing] Audio is silent but context provided, skipping transcription but processing action');
            }

            let savedAudioPath: string | null | undefined = undefined;
            const ensureAudioSaved = async (): Promise<string | null> => {
                if (!shouldSaveAudio || !audioForSave) {
                    return null;
                }
                if (savedAudioPath !== undefined) {
                    return savedAudioPath;
                }
                try {
                    savedAudioPath = await historyBridge.saveAudio(audioForSave, saveMimeType);
                } catch (error) {
                    console.warn('[useActionProcessing] Failed to save audio history', error);
                    savedAudioPath = null;
                }
                return savedAudioPath;
            };

            const authToken = config.auth.access || config.auth.accessToken || undefined;

            const actionTranscribePrompt = action.prompt_recognizing?.trim() || '';
            const globalTranscribePrompt = config.globalTranscribePrompt?.trim() || '';
            const transcriptionPrompt = [globalTranscribePrompt, actionTranscribePrompt]
                .filter(p => p.length > 0)
                .join('\n\n')
                .trim() || undefined;

            let transcription = '';

            // Выполняем транскрипцию только если аудио не тихое
            if (!shouldSkipTranscription) {
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

                // Winky модели используют собственный API для транскрибации
                if (isWinkySpeechModel(config.speech.model) && authToken) {
                    try {
                        const result = await winkyTranscribe(audioData, authToken, {mimeType});
                        transcription = result.text;
                    } catch (error: any) {
                        if (error?.response?.status === 402) {
                            throw error;
                        }
                        throw error;
                    }
                } else {
                    transcription = await speechBridge.transcribe(audioData, {
                        mode: config.speech.mode,
                        model: config.speech.model,
                        openaiKey: config.apiKeys.openai,
                        googleKey: config.apiKeys.google,
                        accessToken: authToken,
                        prompt: transcriptionPrompt
                    }, {
                        signal: abortController?.signal,
                        uiTimeoutMs: TRANSCRIBE_UI_TIMEOUT_MS,
                        mimeType
                    });
                }

                clearSlowLogTimer();
            }

            const transcriptionText = transcription?.trim() ?? '';

            // Проверяем валидность транскрипции
            const isValidResult = isValidTranscription(transcriptionText, transcriptionPrompt);

            // Логируем результат валидации
            if (transcriptionText.length > 0 && !isValidResult) {
                console.warn('[useActionProcessing] Transcription filtered as invalid/hallucination:', {
                    transcription: transcriptionText,
                    length: transcriptionText.length,
                    prompt: transcriptionPrompt
                });
            }

            const hasSpeech = transcriptionText.length > 0 && isValidResult;

            if (!hasSpeech && !hasContext) {
                showToast('No speech detected in the recording.', 'info');
                return;
            }

            const transcriptionForOutput = hasSpeech ? transcriptionText : contextText;
            const llmInputParts = [
                hasSpeech ? transcriptionText : '',
                hasContext ? contextText : ''
            ].filter((part) => part.length > 0);
            const llmInput = llmInputParts.join('\n\n').trim();

            if (!llmInput) {
                console.log('[useActionProcessing] Empty input after silence/context merge, skipping action');
                showToast('Nothing to process. Add context or record speech.', 'info');
                return;
            }

            if (!hasSpeech && hasContext) {
                console.log('[useActionProcessing] Using context-only input for action execution');
            }

            const needsLLM = Boolean(action.prompt && action.prompt.trim());
            const llmModel = action.llm_model?.trim() || config.llm.model;
            const useWinkyLLM = isWinkyLLMModel(llmModel) && authToken;

            // Для Winky LLM моделей - используем чаты
            if (needsLLM && useWinkyLLM) {
                const actionLlmPrompt = action.prompt?.trim() || '';
                const globalLlmPrompt = config.globalLlmPrompt?.trim() || '';
                const llmPrompt = [globalLlmPrompt, actionLlmPrompt]
                    .filter(p => p.length > 0)
                    .join('\n\n')
                    .trim();

                const fullPrompt = llmPrompt ? `${llmPrompt}\n\n${llmInput}` : llmInput;
                const modelLevel = llmModel === 'winky-high' ? 'high' : 'low';

                let streamedResponse = '';

                try {
                    const result = await winkyLLMStream(
                        {
                            prompt: fullPrompt,
                            model_level: modelLevel
                        },
                        authToken,
                        (chunk) => {
                            streamedResponse += chunk;
                        }
                    );

                    const finalResponse = result.content;

                    if (action.auto_copy_result) {
                        await copyWithRetries({
                            text: finalResponse,
                            showToast,
                            successMessage: 'Response copied.',
                            failureMessage: 'Failed to copy the response to the clipboard.'
                        });
                    }

                    await recordHistory({
                        action_id: action.id,
                        action_name: action.name,
                        action_prompt: action.prompt?.trim() || null,
                        transcription: transcriptionForOutput,
                        llm_response: finalResponse,
                        result_text: finalResponse,
                        audio_path: await ensureAudioSaved()
                    });
                    await saveQuickNote(finalResponse);
                    clearContext();

                    // Переходим в чат если show_results
                    if (action.show_results && result.chat_id) {
                        window.winky?.main?.show?.();
                        window.dispatchEvent(new CustomEvent('navigate-to-chat', {detail: {chatId: result.chat_id}}));
                    }

                    await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef, debug: true});
                } catch (error: any) {
                    if (error?.response?.status === 402) {
                        throw error;
                    }
                    throw error;
                }

                return;
            }

            // Для OpenAI/Google моделей - используем Result Page
            if (action.show_results) {
                resultPageBridge.open();
                resultPageBridge.update({
                    transcription: llmInput,
                    llmResponse: needsLLM ? '' : llmInput,
                    isStreaming: needsLLM
                });
            }

            if (!needsLLM) {
                const responseText = llmInput;
                if (action.auto_copy_result) {
                    await copyWithRetries({
                        text: responseText,
                        showToast,
                        successMessage: 'Result copied.',
                        failureMessage: 'Failed to copy the result to the clipboard.'
                    });
                }
                await recordHistory({
                    action_id: action.id,
                    action_name: action.name,
                    action_prompt: action.prompt?.trim() || null,
                    transcription: transcriptionForOutput,
                    llm_response: null,
                    result_text: responseText,
                    audio_path: await ensureAudioSaved()
                });
                await saveQuickNote(responseText);
                clearContext();
                await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef});
                return;
            }

            const llmConfig = {
                mode: config.llm.mode,
                model: llmModel,
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: authToken
            };

            let streamedResponse = '';
            const onChunk = action.show_results
                ? (chunk: string) => {
                    streamedResponse += chunk;
                    resultPageBridge.update({llmResponse: streamedResponse, isStreaming: true});
                }
                : undefined;

            // Используем объединенный запрос (транскрипция + текст из поля) для LLM
            const actionLlmPrompt = action.prompt?.trim() || '';
            const globalLlmPrompt = config.globalLlmPrompt?.trim() || '';
            const llmPrompt = [globalLlmPrompt, actionLlmPrompt]
                .filter(p => p.length > 0)
                .join('\n\n')
                .trim();

            const response = await llmBridge.process(
                llmInput,
                llmPrompt,
                llmConfig,
                onChunk ? {onChunk} : undefined
            );

            const finalResponse = response?.trim().length ? response : streamedResponse;

            if (action.show_results) {
                resultPageBridge.update({llmResponse: finalResponse, isStreaming: false});
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
                transcription: transcriptionForOutput,
                llm_response: finalResponse ?? null,
                result_text: trimmedResponse.length > 0 ? finalResponse : transcriptionForOutput,
                audio_path: await ensureAudioSaved()
            });
            await saveQuickNote(trimmedResponse.length > 0 ? finalResponse ?? '' : transcriptionForOutput);
            clearContext();
            await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef, debug: true});
        } catch (error: any) {
            console.error(error);

            let errorMessage = 'An error occurred while processing the action.';

            // Обработка ошибки 402 - недостаточно кредитов
            if (error?.response?.status === 402) {
                errorMessage = 'Not enough credits. Top up your balance at xlartas.com/billing';
                showToast(errorMessage, 'error');
                return;
            }

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
