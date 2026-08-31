import {useCallback, type RefObject} from 'react';
import type {ActionConfig, ActionHistoryEntry, AppConfig} from '@shared/types';
import {getSiteBaseUrl, LLM_MODES, LLM_WINKY_API_MODELS, SPEECH_WINKY_API_MODELS} from '@shared/constants';
import {createNoteForMode, deriveNoteTitle, resolveNotesStorageMode} from '../../../services/notesService';
import {clipboardBridge, historyBridge, llmBridge, resourcesBridge, speechBridge, windowBridge} from '../../../services/winkyBridge';
import {trimSilenceFromAudioBlob, isAudioSilent} from '../services/audioProcessing';
import {isValidTranscription} from '../services/transcriptionValidation';
import {winkyTranscribe, winkyLLMStream} from '../../../services/winkyAiApi';
import {
    createLocalChatId,
    createLocalMessageId,
    updateLocalChat,
    updateLocalChatMessage,
    upsertLocalChat
} from '../../chats/services/chatStorage';
import {createChatLaunchRequest} from '../../chats/services/chatLaunchRequests';
import {createChatMeta} from '../../chats/utils/chatProviders';
import {isLlmModelCompatible, isTranscriptionModelCompatible} from '@shared/modelRegistry';

const WINKY_LLM_MODELS_SET = new Set<string>([...LLM_WINKY_API_MODELS]);
const WINKY_SPEECH_MODELS_SET = new Set<string>([...SPEECH_WINKY_API_MODELS]);

const isWinkyLLMModel = (model: string): boolean => WINKY_LLM_MODELS_SET.has(model);
const isWinkySpeechModel = (model: string): boolean => WINKY_SPEECH_MODELS_SET.has(model);

const getProvider = (mode: string, model: string, winkyModels: Set<string>): string => {
    if (mode === 'local') return 'local';
    if (winkyModels.has(model)) return 'winky';
    if (model.startsWith('gemini-')) return 'google';
    return 'openai';
};

const getDiagnosticStatus = (error: unknown, fallback: string): string | number => {
    if (typeof error === 'object' && error !== null && 'status' in error) {
        const status = error.status;
        if (typeof status === 'number' || typeof status === 'string') return status;
    }
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = error.response;
        if (typeof response === 'object' && response !== null && 'status' in response) {
            const status = response.status;
            if (typeof status === 'number' || typeof status === 'string') return status;
        }
    }
    if (error instanceof Error && error.name) return error.name;
    return fallback;
};

const getErrorStatus = (error: unknown): number | undefined => {
    const status = getDiagnosticStatus(error, '');
    if (typeof status === 'number') return status;
    const parsed = Number(status);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    return '';
};

const getApiErrorMessage = (error: unknown): string => {
    if (typeof error !== 'object' || error === null) return '';
    if ('details' in error && typeof error.details === 'object' && error.details !== null) {
        const details = error.details as Record<string, unknown>;
        if (typeof details.detail === 'string') return details.detail;
    }
    if (!('response' in error) || typeof error.response !== 'object' || error.response === null) return '';
    const response = error.response as Record<string, unknown>;
    if (typeof response.data !== 'object' || response.data === null) return '';
    const data = response.data as Record<string, unknown>;
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.error !== 'object' || data.error === null) return '';
    const apiError = data.error as Record<string, unknown>;
    return typeof apiError.message === 'string' ? apiError.message : '';
};

const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError';

type ToastFn = (message: string, type?: 'success' | 'info' | 'error', options?: { durationMs?: number }) => void;

const TRANSCRIBE_UI_TIMEOUT_MS = 120_000;
const TRANSCRIBE_SLOW_LOG_MS = 15_000;
const LLM_UI_TIMEOUT_MS = 180_000;

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
        const actionLlmModel = action.llm_model?.trim();
        const llmModel = actionLlmModel && isLlmModelCompatible(config.llm.mode, actionLlmModel)
            ? actionLlmModel
            : config.llm.model;
        const diagnostics = (status: string, error?: unknown) => ({
            provider: [
                getProvider(config.speech.mode, config.speech.model, WINKY_SPEECH_MODELS_SET),
                getProvider(config.llm.mode, llmModel, WINKY_LLM_MODELS_SET)
            ].join('/'),
            model: [config.speech.model, llmModel].join('/'),
            status: getDiagnosticStatus(error, status),
            durationMs: Date.now() - startTime,
            sizeBytes: blob.size
        });

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
            is_streaming?: boolean;
            result_text: string;
            audio_path?: string | null;
        }): Promise<ActionHistoryEntry | null> => {
            try {
                return await historyBridge.add(payload);
            } catch (error) {
                console.warn('[useActionProcessing] Failed to save history', diagnostics('history-save-failed', error));
                return null;
            }
        };

        const runLlmWithTimeout = async <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
            const controller = new AbortController();
            abortController = controller;
            let timedOut = false;
            const timeoutId = window.setTimeout(() => {
                timedOut = true;
                controller.abort(new DOMException('LLM request timed out.', 'AbortError'));
            }, LLM_UI_TIMEOUT_MS);
            try {
                return await operation(controller.signal);
            } catch (error) {
                if (!timedOut) throw error;
                const timeoutError = new Error('The model took too long to respond. Please try again.');
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            } finally {
                window.clearTimeout(timeoutId);
            }
        };

        const updateHistory = async (payload: {
            id: string;
            transcription?: string;
            llm_response?: string;
            is_streaming?: boolean;
            result_text?: string;
            audio_path?: string;
        }): Promise<ActionHistoryEntry | null> => {
            try {
                return await historyBridge.update(payload);
            } catch (error) {
                console.warn('[useActionProcessing] Failed to update history', diagnostics('history-update-failed', error));
                return null;
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
                console.warn('[useActionProcessing] Failed to save quick note', diagnostics('note-save-failed', error));
                showToast('Failed to save the note.', 'error');
            }
        };

        const openHistoryEntry = async (entryId: string) => {
            await windowBridge.openRoute(`/history?entry=${encodeURIComponent(entryId)}`);
        };

        try {
            if (!isTranscriptionModelCompatible(config.speech.mode, config.speech.model)) {
                throw new Error('The selected transcription model is incompatible with the current mode. Open Settings and choose another model.');
            }
            if (!isLlmModelCompatible(config.llm.mode, llmModel)) {
                throw new Error('The selected LLM model is incompatible with the current mode. Open Settings and choose another model.');
            }
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
                if (shouldSaveAudio && !isSilent) {
                    audioForSave = trimmed.audioData;
                    saveMimeType = trimmed.mimeType;
                }
            } else {
                // Проверяем на тишину даже если trimSilence отключен
                isSilent = await isAudioSilent(blob);
                const originalAudioData = await blob.arrayBuffer();
                audioData = originalAudioData;
                if (shouldSaveAudio && !isSilent) {
                    audioForSave = originalAudioData;
                    saveMimeType = mimeType;
                }
            }

            // Проверяем наличие контекста ДО блокировки из-за тишины
            const contextText = contextTextRef.current?.trim() || '';
            const hasContext = contextText.length > 0;

            // Если аудио тихое и нет контекста, не выполняем действие
            if (isSilent && !hasContext) {
                console.log('[useActionProcessing] Audio skipped', diagnostics('silent'));
                showToast('No speech detected in the recording.', 'info');
                return;
            }

            // Если есть контекст, но аудио тихое - пропускаем распознавание речи
            const shouldSkipTranscription = isSilent && hasContext;
            if (shouldSkipTranscription) {
                console.log('[useActionProcessing] Transcription skipped', diagnostics('context-only'));
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
                    console.warn('[useActionProcessing] Failed to save audio history', diagnostics('audio-save-failed', error));
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
                            console.warn(
                                '[useActionProcessing] Transcription still in-flight',
                                diagnostics('transcribing')
                            );
                        }, TRANSCRIBE_SLOW_LOG_MS)
                        : null;

                // Winky модели используют собственный API для транскрибации
                if (config.speech.mode === 'api' && isWinkySpeechModel(config.speech.model)) {
                    const result = await winkyTranscribe(audioData, authToken || '', {
                        mimeType,
                        model: config.speech.model.endsWith('-low') ? 'low' : 'high',
                        signal: abortController?.signal
                    });
                    transcription = result.text;
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
                console.warn('[useActionProcessing] Transcription filtered', diagnostics('filtered'));
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
                console.log('[useActionProcessing] Empty input skipped', diagnostics('empty-input'));
                showToast('Nothing to process. Add context or record speech.', 'info');
                return;
            }

            if (!hasSpeech && hasContext) {
                console.log('[useActionProcessing] Using context-only input', diagnostics('context-only'));
            }

            const needsLLM = Boolean(action.prompt && action.prompt.trim());
            const useWinkyLLM = config.llm.mode === LLM_MODES.API
                && isWinkyLLMModel(llmModel)
                && Boolean(authToken);

            // Для Winky LLM моделей - используем чаты
            if (needsLLM && useWinkyLLM) {
                const actionLlmPrompt = action.prompt?.trim() || '';
                const globalLlmPrompt = config.globalLlmPrompt?.trim() || '';
                const llmPrompt = [globalLlmPrompt, actionLlmPrompt]
                    .filter(p => p.length > 0)
                    .join('\n\n')
                    .trim();

                const fullPrompt = llmPrompt ? `${llmPrompt}\n\n${llmInput}` : llmInput;
                const modelLevel = llmModel === 'winky-high' ? 'high' : llmModel === 'winky-mid' ? 'mid' : 'low';

                if (action.show_results) {
                    const launchRequest = createChatLaunchRequest({
                        text: llmInput,
                        preferredTitle: action.name,
                        additionalContext: llmPrompt || undefined,
                        mode: LLM_MODES.API,
                        model: llmModel
                    });
                    clearContext();
                    await windowBridge.openRoute(`/chats/new?launch=${encodeURIComponent(launchRequest.id)}`);
                    return;
                }

                let streamedResponse = '';
                let historyEntry: ActionHistoryEntry | null = null;
                let historyUpdateTimer: number | null = null;
                let pendingHistoryPayload: {
                    transcription?: string;
                    llm_response?: string;
                    is_streaming?: boolean;
                    result_text?: string;
                    audio_path?: string;
                } | null = null;
                let historyUpdatePromise = Promise.resolve();

                const clearHistoryUpdateTimer = () => {
                    if (historyUpdateTimer === null) {
                        return;
                    }
                    clearTimeout(historyUpdateTimer);
                    historyUpdateTimer = null;
                };

                const flushHistoryUpdate = async () => {
                    if (!historyEntry || !pendingHistoryPayload) {
                        return;
                    }
                    const payload = pendingHistoryPayload;
                    pendingHistoryPayload = null;
                    const updatedEntry = await updateHistory({id: historyEntry.id, ...payload});
                    if (updatedEntry) {
                        historyEntry = updatedEntry;
                    }
                };

                const scheduleHistoryUpdate = (payload: {
                    transcription?: string;
                    llm_response?: string;
                    is_streaming?: boolean;
                    result_text?: string;
                    audio_path?: string;
                }) => {
                    if (!historyEntry) {
                        return;
                    }
                    pendingHistoryPayload = pendingHistoryPayload
                        ? {...pendingHistoryPayload, ...payload}
                        : {...payload};
                    if (historyUpdateTimer !== null) {
                        return;
                    }
                    historyUpdateTimer = window.setTimeout(() => {
                        historyUpdateTimer = null;
                        historyUpdatePromise = historyUpdatePromise.then(flushHistoryUpdate);
                    }, 120);
                };

                try {
                    const actionAudioPath = await ensureAudioSaved();

                    if (action.show_results) {
                        historyEntry = await recordHistory({
                            action_id: action.id,
                            action_name: action.name,
                            action_prompt: action.prompt?.trim() || null,
                            transcription: transcriptionForOutput,
                            llm_response: null,
                            is_streaming: true,
                            result_text: transcriptionForOutput,
                            audio_path: actionAudioPath
                        });
                        if (historyEntry) {
                            await openHistoryEntry(historyEntry.id);
                        }
                    }

                    const result = await runLlmWithTimeout((signal) => winkyLLMStream(
                        {
                            prompt: fullPrompt,
                            model_level: modelLevel
                        },
                        authToken || '',
                        (chunk) => {
                            streamedResponse += chunk;
                            if (action.show_results && historyEntry) {
                                scheduleHistoryUpdate({
                                    transcription: transcriptionForOutput,
                                    llm_response: streamedResponse,
                                    is_streaming: true,
                                    result_text: streamedResponse,
                                    audio_path: actionAudioPath ?? undefined
                                });
                            }
                        },
                        signal
                    ));

                    clearHistoryUpdateTimer();
                    await historyUpdatePromise;
                    await flushHistoryUpdate();

                    const finalResponse = result.content?.trim().length ? result.content : streamedResponse;
                    const resultText = finalResponse.trim().length > 0 ? finalResponse : transcriptionForOutput;

                    if (action.auto_copy_result) {
                        await copyWithRetries({
                            text: finalResponse,
                            showToast,
                            successMessage: 'Response copied.',
                            failureMessage: 'Failed to copy the response to the clipboard.'
                        });
                    }

                    if (historyEntry) {
                        const updatedEntry = await updateHistory({
                            id: historyEntry.id,
                            transcription: transcriptionForOutput,
                            llm_response: finalResponse,
                            is_streaming: false,
                            result_text: resultText,
                            audio_path: actionAudioPath ?? undefined
                        });
                        if (updatedEntry) {
                            historyEntry = updatedEntry;
                        }
                    } else {
                        historyEntry = await recordHistory({
                            action_id: action.id,
                            action_name: action.name,
                            action_prompt: action.prompt?.trim() || null,
                            transcription: transcriptionForOutput,
                            llm_response: finalResponse || null,
                            is_streaming: false,
                            result_text: resultText,
                            audio_path: actionAudioPath
                        });
                    }
                    await saveQuickNote(resultText);
                    clearContext();

                    // Переходим в чат если show_results
                    if (action.show_results) {
                        if (historyEntry) {
                            await openHistoryEntry(historyEntry.id);
                        } else if (result.chat_id) {
                            await windowBridge.openRoute(`/chats/${encodeURIComponent(result.chat_id)}`);
                        }
                    }

                    await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef, debug: true});
                } catch (error: any) {
                    clearHistoryUpdateTimer();
                    await historyUpdatePromise;
                    await flushHistoryUpdate();
                    if (historyEntry) {
                        await updateHistory({
                            id: historyEntry.id,
                            is_streaming: false
                        });
                    }
                    if (error?.response?.status === 402) {
                        throw error;
                    }
                    throw error;
                }

                return;
            }

            // Для OpenAI/Google моделей тоже ведём show_results через live History entry
            let historyEntry: ActionHistoryEntry | null = null;
            let historyUpdateTimer: number | null = null;
            let pendingHistoryPayload: {
                transcription?: string;
                llm_response?: string;
                is_streaming?: boolean;
                result_text?: string;
                audio_path?: string;
            } | null = null;
            let historyUpdatePromise = Promise.resolve();

            const clearHistoryUpdateTimer = () => {
                if (historyUpdateTimer === null) {
                    return;
                }
                clearTimeout(historyUpdateTimer);
                historyUpdateTimer = null;
            };

            const flushHistoryUpdate = async () => {
                if (!historyEntry || !pendingHistoryPayload) {
                    return;
                }
                const payload = pendingHistoryPayload;
                pendingHistoryPayload = null;
                const updatedEntry = await updateHistory({id: historyEntry.id, ...payload});
                if (updatedEntry) {
                    historyEntry = updatedEntry;
                }
            };

            const scheduleHistoryUpdate = (payload: {
                transcription?: string;
                llm_response?: string;
                is_streaming?: boolean;
                result_text?: string;
                audio_path?: string;
            }) => {
                if (!historyEntry) {
                    return;
                }
                pendingHistoryPayload = pendingHistoryPayload
                    ? {...pendingHistoryPayload, ...payload}
                    : {...payload};
                if (historyUpdateTimer !== null) {
                    return;
                }
                historyUpdateTimer = window.setTimeout(() => {
                    historyUpdateTimer = null;
                    historyUpdatePromise = historyUpdatePromise.then(flushHistoryUpdate);
                }, 120);
            };

            const actionAudioPath = await ensureAudioSaved();

            if (!needsLLM) {
                const responseText = llmInput;
                if (action.show_results) {
                    historyEntry = await recordHistory({
                        action_id: action.id,
                        action_name: action.name,
                        action_prompt: action.prompt?.trim() || null,
                        transcription: transcriptionForOutput,
                        llm_response: responseText,
                        is_streaming: false,
                        result_text: responseText,
                        audio_path: actionAudioPath
                    });
                    if (historyEntry) {
                        await openHistoryEntry(historyEntry.id);
                    }
                }
                if (action.auto_copy_result) {
                    await copyWithRetries({
                        text: responseText,
                        showToast,
                        successMessage: 'Result copied.',
                        failureMessage: 'Failed to copy the result to the clipboard.'
                    });
                }
                if (!historyEntry) {
                    await recordHistory({
                        action_id: action.id,
                        action_name: action.name,
                        action_prompt: action.prompt?.trim() || null,
                        transcription: transcriptionForOutput,
                        llm_response: responseText,
                        result_text: responseText,
                        audio_path: actionAudioPath
                    });
                }
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

            if (needsLLM && action.show_results) {
                const actionLlmPrompt = action.prompt?.trim() || '';
                const globalLlmPrompt = config.globalLlmPrompt?.trim() || '';
                const llmPrompt = [globalLlmPrompt, actionLlmPrompt]
                    .filter(p => p.length > 0)
                    .join('\n\n')
                    .trim();
                const startedAt = new Date().toISOString();
                const assistantStartedAt = new Date(Date.now() + 1).toISOString();
                const localChatId = createLocalChatId();
                const userMessageId = createLocalMessageId();
                const assistantMessageId = createLocalMessageId();
                const chatMeta = createChatMeta(config.llm.mode, llmModel);
                let streamedResponse = '';

                upsertLocalChat(
                    {
                        id: localChatId,
                        title: action.name,
                        additional_context: llmPrompt,
                        message_count: 2,
                        last_leaf_message_id: assistantMessageId,
                        pinned_at: null,
                        created_at: startedAt,
                        updated_at: startedAt,
                        ...chatMeta
                    },
                    [
                        {
                            id: userMessageId,
                            parent_id: null,
                            role: 'user',
                            content: llmInput,
                            model_level: llmModel,
                            provider: chatMeta.provider,
                            model_name: llmModel,
                            tokens: 0,
                            has_children: false,
                            sibling_count: 0,
                            sibling_index: 0,
                            created_at: startedAt
                        },
                        {
                            id: assistantMessageId,
                            parent_id: userMessageId,
                            role: 'assistant',
                            content: 'Thinking...',
                            model_level: llmModel,
                            provider: chatMeta.provider,
                            model_name: llmModel,
                            tokens: 0,
                            has_children: false,
                            sibling_count: 0,
                            sibling_index: 0,
                            created_at: assistantStartedAt
                        }
                    ]
                );
                await windowBridge.openRoute(`/chats/${encodeURIComponent(localChatId)}`);

                try {
                    const response = await runLlmWithTimeout((signal) => llmBridge.process(
                        llmInput,
                        llmPrompt,
                        llmConfig,
                        {
                            onChunk: (chunk) => {
                                streamedResponse += chunk;
                                updateLocalChatMessage(localChatId, assistantMessageId, {
                                    content: streamedResponse,
                                    provider: chatMeta.provider,
                                    model_name: llmModel,
                                    model_level: llmModel
                                });
                                updateLocalChat(localChatId, {
                                    title: action.name,
                                    additional_context: llmPrompt,
                                    updated_at: new Date().toISOString(),
                                    last_leaf_message_id: assistantMessageId,
                                    message_count: 2
                                });
                            },
                            signal
                        }
                    ));

                    const finalResponse = response?.trim().length ? response : streamedResponse;
                    const resultText = finalResponse.trim().length > 0 ? finalResponse : transcriptionForOutput;

                    updateLocalChatMessage(localChatId, assistantMessageId, {
                        content: resultText,
                        provider: chatMeta.provider,
                        model_name: llmModel,
                        model_level: llmModel
                    });
                    updateLocalChat(localChatId, {
                        title: action.name,
                        additional_context: llmPrompt,
                        updated_at: new Date().toISOString(),
                        last_leaf_message_id: assistantMessageId,
                        message_count: 2
                    });

                    if (action.auto_copy_result) {
                        await copyWithRetries({
                            text: finalResponse ?? '',
                            showToast,
                            successMessage: 'Response copied.',
                            failureMessage: 'Failed to copy the response to the clipboard.'
                        });
                    }

                    await saveQuickNote(resultText);
                    clearContext();
                    await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef, debug: true});
                } catch (error) {
                    updateLocalChatMessage(localChatId, assistantMessageId, {
                        content: streamedResponse || 'Failed to generate response.',
                        provider: chatMeta.provider,
                        model_name: llmModel,
                        model_level: llmModel
                    });
                    updateLocalChat(localChatId, {
                        updated_at: new Date().toISOString(),
                        last_leaf_message_id: assistantMessageId,
                        message_count: 2
                    });
                    throw error;
                }

                return;
            }

            let streamedResponse = '';
            const onChunk = action.show_results
                ? (chunk: string) => {
                    streamedResponse += chunk;
                    if (historyEntry) {
                        scheduleHistoryUpdate({
                            transcription: transcriptionForOutput,
                            llm_response: streamedResponse,
                            is_streaming: true,
                            result_text: streamedResponse,
                            audio_path: actionAudioPath ?? undefined
                        });
                    }
                }
                : undefined;

            // Используем объединенный запрос (транскрипция + текст из поля) для LLM
            const actionLlmPrompt = action.prompt?.trim() || '';
            const globalLlmPrompt = config.globalLlmPrompt?.trim() || '';
            const llmPrompt = [globalLlmPrompt, actionLlmPrompt]
                .filter(p => p.length > 0)
                .join('\n\n')
                .trim();

            try {
                if (action.show_results) {
                    historyEntry = await recordHistory({
                        action_id: action.id,
                        action_name: action.name,
                        action_prompt: action.prompt?.trim() || null,
                        transcription: transcriptionForOutput,
                        llm_response: null,
                        is_streaming: true,
                        result_text: transcriptionForOutput,
                        audio_path: actionAudioPath
                    });
                    if (historyEntry) {
                        await openHistoryEntry(historyEntry.id);
                    }
                }

                const response = await runLlmWithTimeout((signal) => llmBridge.process(
                    llmInput,
                    llmPrompt,
                    llmConfig,
                    {onChunk, signal}
                ));

                clearHistoryUpdateTimer();
                await historyUpdatePromise;
                await flushHistoryUpdate();

                const finalResponse = response?.trim().length ? response : streamedResponse;
                const trimmedResponse = finalResponse?.trim() || '';
                const resultText = trimmedResponse.length > 0 ? finalResponse : transcriptionForOutput;

                if (action.auto_copy_result) {
                    await copyWithRetries({
                        text: finalResponse ?? '',
                        showToast,
                        successMessage: 'Response copied.',
                        failureMessage: 'Failed to copy the response to the clipboard.'
                    });
                }

                if (historyEntry) {
                    const updatedEntry = await updateHistory({
                        id: historyEntry.id,
                        transcription: transcriptionForOutput,
                        llm_response: finalResponse,
                        is_streaming: false,
                        result_text: resultText,
                        audio_path: actionAudioPath ?? undefined
                    });
                    if (updatedEntry) {
                        historyEntry = updatedEntry;
                    }
                } else {
                    historyEntry = await recordHistory({
                        action_id: action.id,
                        action_name: action.name,
                        action_prompt: action.prompt?.trim() || null,
                        transcription: transcriptionForOutput,
                        llm_response: finalResponse ?? null,
                        is_streaming: false,
                        result_text: resultText,
                        audio_path: actionAudioPath
                    });
                }

                await saveQuickNote(trimmedResponse.length > 0 ? finalResponse ?? '' : transcriptionForOutput);
                clearContext();

                if (action.show_results && historyEntry) {
                    await openHistoryEntry(historyEntry.id);
                }

                await playCompletionSound({action: completionAction, config, audioRef: completionSoundRef, debug: true});
            } catch (error) {
                clearHistoryUpdateTimer();
                await historyUpdatePromise;
                await flushHistoryUpdate();
                if (historyEntry) {
                    await updateHistory({
                        id: historyEntry.id,
                        is_streaming: false
                    });
                }
                throw error;
            }
        } catch (error: unknown) {
            console.error('[useActionProcessing] Action processing failed', diagnostics('failed', error));

            if (isAbortError(error)) return;

            let errorMessage = 'An error occurred while processing the action.';
            const status = getErrorStatus(error);
            const apiErrorMessage = getApiErrorMessage(error);
            const originalMessage = getErrorMessage(error);

            // Обработка ошибки 402 - недостаточно кредитов
            if (status === 402) {
                errorMessage = `Not enough credits. Top up your balance at ${getSiteBaseUrl()}/billing`;
                showToast(errorMessage, 'error');
                return;
            }

            if (status === 401) {
                if (apiErrorMessage) {
                    if (apiErrorMessage.includes('API key')) {
                        const hasGoogleKey = !!config?.apiKeys.google?.trim();
                        const hasOpenAiKey = !!config?.apiKeys.openai?.trim();
                        if (originalMessage.includes('Google') || originalMessage.includes('Gemini')) {
                            errorMessage = hasOpenAiKey
                                ? 'Google API key is missing or invalid. Switch to OpenAI models or Local mode, or add Google key in Settings.'
                                : 'Google API key is missing or invalid. Switch to Local mode or add API key in Settings.';
                        } else {
                            errorMessage = hasGoogleKey
                                ? 'OpenAI API key is missing or invalid. Switch to Google models or Local mode, or add OpenAI key in Settings.'
                                : 'OpenAI API key is missing or invalid. Switch to Local mode or add API key in Settings.';
                        }
                    } else {
                        errorMessage = `Authentication error: ${apiErrorMessage}`;
                    }
                } else {
                    errorMessage = 'API authentication error. Check your API keys in Settings or switch to Local mode.';
                }
            } else if (status) {
                if (apiErrorMessage) {
                    errorMessage = `API error: ${apiErrorMessage}`;
                } else {
                    errorMessage = `Request error (status ${status})`;
                }
            } else if (originalMessage) {
                // Улучшаем сообщения об ошибках связанных с ключами
                if (originalMessage.includes('API key') || originalMessage.includes('key')) {
                    const hasGoogleKey = !!config?.apiKeys.google?.trim();
                    const hasOpenAiKey = !!config?.apiKeys.openai?.trim();
                    if (originalMessage.includes('Google') || originalMessage.includes('Gemini')) {
                        errorMessage = hasOpenAiKey
                            ? 'Google API key is missing. Switch to OpenAI models or Local mode, or add Google key in Settings.'
                            : 'Google API key is missing. Switch to Local mode or add API key in Settings.';
                    } else if (originalMessage.includes('OpenAI')) {
                        errorMessage = hasGoogleKey
                            ? 'OpenAI API key is missing. Switch to Google models or Local mode, or add OpenAI key in Settings.'
                            : 'OpenAI API key is missing. Switch to Local mode or add API key in Settings.';
                    } else {
                        errorMessage = originalMessage;
                    }
                } else {
                    errorMessage = originalMessage;
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
            let settled = false;
            let timeoutId: number | null = null;
            let verifyId: number | null = null;

            const finish = (success: boolean, error?: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
                if (verifyId !== null) {
                    clearTimeout(verifyId);
                }
                if (success) {
                    if (debug) {
                        console.log('[useActionProcessing] Sound played via HTML Audio, volume:', volumePreference);
                    }
                    resolve(true);
                    return;
                }
                if (debug) {
                    console.warn('[useActionProcessing] HTML Audio failed:', error);
                }
                resolve(false);
            };

            const startPlayback = () => {
                const before = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
                audio.play()
                    .then(() => {
                        // In some autostart scenarios play() resolves but sound does not actually start.
                        verifyId = window.setTimeout(() => {
                            const after = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
                            const progressed = after > before + 0.01;
                            const active = !audio.paused || !audio.ended;
                            if (progressed || active) {
                                finish(true);
                                return;
                            }
                            finish(false, 'playback did not progress');
                        }, 220);
                    })
                    .catch((error) => finish(false, error));
            };

            if (audio.readyState >= 2) {
                startPlayback();
            } else {
                audio.load();
                audio.addEventListener('canplay', startPlayback, {once: true});
                audio.addEventListener('error', () => finish(false, 'load error'), {once: true});
            }

            timeoutId = window.setTimeout(() => finish(false, 'timeout'), 3000);
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
