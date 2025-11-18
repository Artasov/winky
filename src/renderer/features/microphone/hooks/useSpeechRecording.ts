import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FAST_WHISPER_PORT, SPEECH_MODES} from '@shared/constants';
import type {ActionConfig, AppConfig} from '@shared/types';
import {resetInteractive, setRecordingInteractive} from '../../../utils/interactive';
import {createSpeechRecorder, type SpeechRecorder} from '../services/SpeechRecorder';
import {
    actionHotkeysBridge,
    clipboardBridge,
    llmBridge,
    micBridge,
    notificationBridge,
    resultBridge,
    speechBridge,
    windowBridge
} from '../../../services/winkyBridge';

type ToastFn = (message: string, type?: 'success' | 'info' | 'error', options?: { durationMs?: number }) => void;

type UseSpeechRecordingParams = {
    config: AppConfig | null;
    showToast: ToastFn;
    isMicOverlay: boolean;
};

const isLocalServerUnavailableMessage = (message?: string): boolean => {
    if (!message) {
        return false;
    }
    const normalized = message.toLowerCase();
    return normalized.includes('fast-fast-whisper')
        || normalized.includes('local server')
        || normalized.includes(`127.0.0.1:${FAST_WHISPER_PORT}`)
        || normalized.includes('econnrefused')
        || (normalized.includes('локал') && normalized.includes('сервер'));
};

export const useSpeechRecording = ({config, showToast, isMicOverlay}: UseSpeechRecordingParams) => {
    const recorderRef = useRef<SpeechRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const autoStartPendingRef = useRef(false);
    const isRecordingRef = useRef(false);
    const processingRef = useRef(false);
    const lastDomActionHotkeyTsRef = useRef(0);
    const lastGlobalActionHotkeyTsRef = useRef(0);
    const handleMicrophoneToggleRef = useRef<(() => Promise<void> | void) | null>(null);
    const completionSoundRef = useRef<HTMLAudioElement | null>(null);
    const localServerAlertInFlightRef = useRef(false);
    const localServerAlertReleaseRef = useRef<number | null>(null);
    const lastCommittedVolumeRef = useRef<{ value: number; timestamp: number }>({value: 0, timestamp: 0});
    const windowVisibleRef = useRef(true);
    const currentStreamRef = useRef<MediaStream | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [volume, setVolume] = useState(0);

    const commitVolumeSample = useCallback((nextValue: number) => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const previous = lastCommittedVolumeRef.current;
        const difference = Math.abs(nextValue - previous.value);
        if (difference < 0.025 && now - previous.timestamp < 48) {
            return;
        }
        lastCommittedVolumeRef.current = {value: nextValue, timestamp: now};
        setVolume(nextValue);
    }, []);

    const scheduleLocalServerAlertRelease = useCallback(() => {
        if (typeof window === 'undefined') {
            localServerAlertInFlightRef.current = false;
            if (localServerAlertReleaseRef.current !== null) {
                localServerAlertReleaseRef.current = null;
            }
            return;
        }
        if (localServerAlertReleaseRef.current !== null) {
            window.clearTimeout(localServerAlertReleaseRef.current);
        }
        localServerAlertReleaseRef.current = window.setTimeout(() => {
            localServerAlertInFlightRef.current = false;
            localServerAlertReleaseRef.current = null;
        }, 4000);
    }, []);

    const warmUpRecorder = useCallback(async () => {
        try {
            await recorderRef.current?.warmUp();
        } catch (error) {
            console.warn('[MicOverlay] Recorder warm-up failed', error);
        }
    }, []);

    useEffect(() => {
        recorderRef.current = createSpeechRecorder();
        return () => {
            recorderRef.current?.dispose();
            recorderRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!isMicOverlay) {
            return;
        }
        void warmUpRecorder();
    }, [isMicOverlay, warmUpRecorder]);

    const stopVolumeMonitor = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = undefined;
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {
                /* ignore */
            });
            audioContextRef.current = null;
            analyserRef.current = null;
        }
        lastCommittedVolumeRef.current = {value: 0, timestamp: 0};
        setVolume(0);
        currentStreamRef.current = null;
    }, []);

    const startVolumeMonitor = useCallback((stream: MediaStream) => {
        stopVolumeMonitor();
        currentStreamRef.current = stream;
        if (!windowVisibleRef.current) {
            return;
        }
        try {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            const buffer = new Uint8Array(analyser.fftSize);

            const update = () => {
                if (!windowVisibleRef.current) {
                    animationFrameRef.current = undefined;
                    return;
                }
                analyser.getByteTimeDomainData(buffer);
                let sumSquares = 0;
                for (let i = 0; i < buffer.length; i += 1) {
                    const deviation = buffer[i] - 128;
                    sumSquares += deviation * deviation;
                }
                const rms = Math.sqrt(sumSquares / buffer.length) / 128;
                commitVolumeSample(Number.isFinite(rms) ? rms : 0);
                animationFrameRef.current = requestAnimationFrame(update);
            };

            update();
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
        } catch (error) {
            console.error('[MicOverlay] Не удалось инициализировать визуализацию микрофона', error);
        }
    }, [commitVolumeSample, stopVolumeMonitor]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const api = window.winky;
        if (!api?.on) {
            return;
        }
        const handleVisibilityChange = (
            first?: { visible?: boolean } | unknown,
            second?: { visible?: boolean }
        ) => {
            const payload = (first && typeof (first as any)?.visible === 'boolean')
                ? (first as { visible?: boolean })
                : second;
            const isVisible = payload?.visible === true;
            windowVisibleRef.current = isVisible;
            if (!isVisible) {
                stopVolumeMonitor();
            } else if (isRecordingRef.current && currentStreamRef.current) {
                startVolumeMonitor(currentStreamRef.current);
            }
        };
        
        const handleDocumentVisibilityChange = () => {
            const isVisible = !document.hidden;
            windowVisibleRef.current = isVisible;
            if (!isVisible) {
                stopVolumeMonitor();
            } else if (isRecordingRef.current && currentStreamRef.current) {
                startVolumeMonitor(currentStreamRef.current);
            }
        };
        
        api.on('mic:visibility-change', handleVisibilityChange);
        document.addEventListener('visibilitychange', handleDocumentVisibilityChange);
        
        if (document.hidden) {
            windowVisibleRef.current = false;
            stopVolumeMonitor();
        }
        
        return () => {
            api.removeListener?.('mic:visibility-change', handleVisibilityChange);
            document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
        };
    }, [isMicOverlay, stopVolumeMonitor, startVolumeMonitor]);

    const handleLocalSpeechServerFailure = useCallback((message?: string): boolean => {
        if (config?.speech.mode !== SPEECH_MODES.LOCAL) {
            return false;
        }
        if (!isLocalServerUnavailableMessage(message)) {
            return false;
        }
        if (localServerAlertInFlightRef.current) {
            return true;
        }
        localServerAlertInFlightRef.current = true;
        const failureMessage = 'Локальный сервер распознавания недоступен. Открываем Settings…';
        if (typeof window === 'undefined') {
            showToast(failureMessage, 'error', {durationMs: 4000});
            localServerAlertInFlightRef.current = false;
            return true;
        }
        let notified = false;
        const notifyMainWindow = () => {
            if (notified) {
                return;
            }
            notified = true;
            void windowBridge.navigate('/settings');
            const publishToast = () => {
                void notificationBridge.showToast(failureMessage, 'error', {durationMs: 1_000_000_000});
            };
            publishToast();
            setTimeout(publishToast, 800);
            scheduleLocalServerAlertRelease();
        };
        const attemptOpen = () => windowBridge.openSettings();
        attemptOpen()
            .then(() => {
                notifyMainWindow();
            })
            .catch((error) => {
                console.warn('[MicOverlay] Первое открытие Settings не удалось, повторяем попытку…', error);
                setTimeout(() => {
                    attemptOpen()
                        .then(() => {
                            notifyMainWindow();
                        })
                        .catch((retryError) => {
                            console.error('[MicOverlay] Не удалось открыть главное окно настроек.', retryError);
                            notifyMainWindow();
                        });
                }, 600);
            });
        return true;
    }, [config?.speech.mode, showToast, scheduleLocalServerAlertRelease]);

    const ensureSpeechService = useCallback(() => {
        if (!recorderRef.current) {
            showToast('Сервис записи недоступен.', 'error');
            return false;
        }
        return true;
    }, [showToast]);

    const finishRecording = useCallback(async (resetUI: boolean = true): Promise<Blob | null> => {
        if (!recorderRef.current) {
            return null;
        }

        try {
            const blob = await recorderRef.current.stopRecording();
            return blob;
        } catch (error) {
            console.error(error);
            showToast('Не удалось остановить запись.', 'error');
            return null;
        } finally {
            if (resetUI) {
                setIsRecording(false);
                stopVolumeMonitor();
            }
        }
    }, [showToast, stopVolumeMonitor]);

    const processAction = useCallback(async (action: ActionConfig, blob: Blob) => {
        if (!config) {
            return;
        }
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const authToken = config.auth.access || config.auth.accessToken || undefined;

            const transcription = await speechBridge.transcribe(arrayBuffer, {
                mode: config.speech.mode,
                model: config.speech.model,
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: authToken,
                prompt: action.prompt_recognizing?.trim() || undefined
            });

            if (!transcription) {
                showToast('Не удалось распознать речь для действия.', 'error');
                return;
            }

            if (action.show_results) {
                await resultBridge.open();
                await new Promise((resolve) => setTimeout(resolve, 200));
                await resultBridge.update({transcription, llmResponse: '', isStreaming: false});
            }

            if (!action.prompt || action.prompt.trim() === '') {
                if (action.auto_copy_result) {
                    await clipboardBridge.writeText(transcription);
                    showToast('Результат скопирован.', 'success');
                }
                if (action.show_results) {
                    await resultBridge.update({llmResponse: transcription, isStreaming: false});
                }
                if (action.sound_on_complete && completionSoundRef.current) {
                    const volumePreference = config?.completionSoundVolume ?? 1.0;
                    if (volumePreference > 0) {
                        completionSoundRef.current.volume = volumePreference;
                        completionSoundRef.current.play().catch((error) => {
                            console.error('[MicOverlay] Error playing sound:', error);
                        });
                    }
                }
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
                await clipboardBridge.writeText(response);
                showToast('Ответ скопирован.', 'success');
            }

            if (action.sound_on_complete && completionSoundRef.current) {
                const volumePreference = config?.completionSoundVolume ?? 1.0;
                if (volumePreference > 0) {
                    completionSoundRef.current.volume = volumePreference;
                    completionSoundRef.current.play().catch((error) => {
                        console.error('[MicOverlay] Error playing sound:', error);
                    });
                }
            }
        } catch (error: any) {
            console.error(error);
            
            // Формируем понятное сообщение об ошибке
            let errorMessage = 'Ошибка при обработке действия.';
            
            if (error?.response?.status === 401) {
                // Ошибка авторизации OpenAI
                const errorData = error?.response?.data?.error;
                if (errorData?.message) {
                    if (errorData.message.includes('API key')) {
                        errorMessage = 'Не указан или неверный OpenAI API ключ. Проверьте настройки.';
                    } else {
                        errorMessage = `Ошибка авторизации: ${errorData.message}`;
                    }
                } else {
                    errorMessage = 'Ошибка авторизации OpenAI. Проверьте API ключ в настройках.';
                }
            } else if (error?.response?.status) {
                // Другие HTTP ошибки
                const errorData = error?.response?.data?.error;
                if (errorData?.message) {
                    errorMessage = `Ошибка API: ${errorData.message}`;
                } else {
                    errorMessage = `Ошибка запроса (код ${error.response.status})`;
                }
            } else if (error?.message) {
                errorMessage = error.message;
            }
            
            // Проверяем не связана ли ошибка с локальным сервером речи
            if (!handleLocalSpeechServerFailure(errorMessage)) {
                // Открываем главное окно и показываем Toast там
                try {
                    const {invoke} = await import('@tauri-apps/api/core');
                    const {emit} = await import('@tauri-apps/api/event');
                    
                    console.log('[useSpeechRecording] Opening main window for error:', errorMessage);
                    
                    // Открываем главное окно через Rust команду (создает окно заново если его нет)
                    try {
                        await invoke('window_open_main');
                        console.log('[useSpeechRecording] Main window opened successfully');
                    } catch (invokeError) {
                        console.error('[useSpeechRecording] Failed to open main window via command:', invokeError);
                        // Пробуем альтернативный способ
                        const {WebviewWindow} = await import('@tauri-apps/api/webviewWindow');
                        const mainWindow = await WebviewWindow.getByLabel('main').catch(() => null);
                        if (mainWindow) {
                            await mainWindow.show().catch(() => {});
                            await mainWindow.setFocus().catch(() => {});
                            console.log('[useSpeechRecording] Main window opened via WebviewWindow API');
                        } else {
                            throw new Error('Could not open main window');
                        }
                    }
                    
                    // Увеличиваем задержку чтобы окно успело полностью загрузиться перед показом Toast
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Показываем Toast в главном окне через событие
                    console.log('[useSpeechRecording] Showing toast in main window:', errorMessage);
                    await emit('app:toast', {
                        message: errorMessage,
                        type: 'error',
                        options: {durationMs: 6000}
                    });
                } catch (windowError) {
                    console.error('[useSpeechRecording] Failed to open main window:', windowError);
                    // Fallback - показываем Toast в текущем окне
                    console.log('[useSpeechRecording] Showing toast in current window as fallback');
                    showToast(errorMessage, 'error', {durationMs: 6000});
                }
            }
        }
    }, [config, showToast, handleLocalSpeechServerFailure]);

    const handleMicrophoneToggle = useCallback(async () => {
        if (!ensureSpeechService()) {
            return;
        }

        if (!isRecording) {
            try {
                const stream = await recorderRef.current?.startRecording();
                setIsRecording(true);
                setActiveActionId(null);
                if (stream) {
                    startVolumeMonitor(stream);
                }
            } catch (error) {
                console.error(error);
                showToast('Не удалось начать запись. Проверьте доступ к микрофону.', 'error');
            }
            return;
        }

        try {
            await finishRecording();
        } finally {
            setActiveActionId(null);
            resetInteractive();
            if (isMicOverlay && config?.micHideOnStopRecording !== false) {
                void micBridge.hide({reason: 'action'});
            }
        }
    }, [ensureSpeechService, finishRecording, isRecording, showToast, startVolumeMonitor, isMicOverlay, config?.micHideOnStopRecording]);

    const handleActionClick = useCallback(async (action: ActionConfig) => {
        if (processingRef.current || processing || !isRecordingRef.current || !isRecording || !ensureSpeechService()) {
            return;
        }

        processingRef.current = true;
        setActiveActionId(action.id);
        setProcessing(true);
        try {
            const blob = await finishRecording(false);
            if (blob) {
                await processAction(action, blob);
            }
        } finally {
            setIsRecording(false);
            stopVolumeMonitor();
            setActiveActionId(null);
            processingRef.current = false;
            setProcessing(false);
            resetInteractive();
            if (isMicOverlay && config?.micHideOnStopRecording !== false) {
                void micBridge.hide({reason: 'action'});
            }
        }
    }, [processing, isRecording, ensureSpeechService, finishRecording, processAction, stopVolumeMonitor, isMicOverlay, config?.micHideOnStopRecording]);

    const actions = useMemo<ActionConfig[]>(() => config?.actions ?? [], [config?.actions]);
    const activeActions = useMemo<ActionConfig[]>(() => actions.filter((action) => action.is_active !== false), [actions]);
    const displayedActions = useMemo<ActionConfig[]>(() => {
        if (!isRecording || activeActions.length === 0) {
            return [];
        }
        const MAX_FLOATING_ACTIONS = 6;
        return activeActions.slice(0, MAX_FLOATING_ACTIONS);
    }, [activeActions, isRecording]);

    const normalizedVolume = Math.min(volume * 2.5, 1);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        console.log('[speech-recording] isRecording changed', {isRecording});
        setRecordingInteractive(isRecording);
    }, [isRecording]);

    useEffect(() => {
        processingRef.current = processing;
    }, [processing]);

    useEffect(() => {
        handleMicrophoneToggleRef.current = handleMicrophoneToggle;
    }, [handleMicrophoneToggle]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const handler = (event: KeyboardEvent) => {
            if (!isRecordingRef.current || activeActions.length === 0 || event.repeat) {
                return;
            }
            const action = activeActions.find((a) => {
                if (!a.hotkey) {
                    return false;
                }
                const normalizedActionHotkey = a.hotkey.trim().replace(/\s+/g, '');
                const parts: string[] = [];
                if (event.ctrlKey || event.metaKey) {
                    parts.push('Ctrl');
                }
                if (event.altKey) {
                    parts.push('Alt');
                }
                if (event.shiftKey) {
                    parts.push('Shift');
                }
                if (event.key) {
                    parts.push(event.key.toUpperCase());
                }
                const normalizedEventHotkey = parts.join('');
                return normalizedActionHotkey.toLowerCase() === normalizedEventHotkey.toLowerCase();
            });
            if (!action) {
                return;
            }
            const now = Date.now();
            lastDomActionHotkeyTsRef.current = now;
            if (now - lastGlobalActionHotkeyTsRef.current < 150) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            void handleActionClick(action);
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [activeActions, handleActionClick, isMicOverlay]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        if (!isRecording) {
            void actionHotkeysBridge.clear();
            return;
        }
        const hotkeys = activeActions
            .filter((action) => typeof action.hotkey === 'string' && action.hotkey.trim().length > 0)
            .map((action) => ({
                id: action.id,
                accelerator: action.hotkey!.trim()
            }));

        if (hotkeys.length === 0) {
            void actionHotkeysBridge.clear();
            return;
        }

        void actionHotkeysBridge.register(hotkeys);

        return () => {
            void actionHotkeysBridge.clear();
        };
    }, [activeActions, isMicOverlay, isRecording]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const handler = (payload: { actionId?: string }) => {
            if (!payload?.actionId || !isRecording) {
                return;
            }
            const action = activeActions.find((item) => item.id === payload.actionId);
            if (!action) {
                return;
            }
            const now = Date.now();
            if (now - lastDomActionHotkeyTsRef.current < 150) {
                return;
            }
            lastGlobalActionHotkeyTsRef.current = now;
            void handleActionClick(action);
        };
        const unsubscribe = window.winky?.on?.('hotkey:action-triggered', handler as any);
        return () => {
            unsubscribe?.();
        };
    }, [activeActions, handleActionClick, isMicOverlay, isRecording]);

    return {
        view: {
            isRecording,
            processing,
            activeActionId,
            displayedActions,
            actionsVisible: displayedActions.length > 0,
            normalizedVolume
        },
        refs: {
            completionSoundRef,
            handleMicrophoneToggleRef,
            autoStartPendingRef,
            isRecordingRef,
            processingRef
        },
        handlers: {
            handleMicrophoneToggle,
            handleActionClick,
            finishRecording,
            setActiveActionId,
            warmUpRecorder
        }
    };
};
