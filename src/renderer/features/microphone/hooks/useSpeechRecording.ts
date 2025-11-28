import {useCallback, useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {emit} from '@tauri-apps/api/event';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {FAST_WHISPER_PORT, SPEECH_MODES, LLM_MODES} from '@shared/constants';
import type {ActionConfig, AppConfig} from '@shared/types';
import {resetInteractive, setRecordingInteractive} from '../../../utils/interactive';
import {createSpeechRecorder, type SpeechRecorder} from '../services/SpeechRecorder';
import {
    getLocalSpeechModelMetadata,
    normalizeLocalSpeechModelName,
    subscribeToLocalModelWarmup
} from '../../../services/localSpeechModels';
import {
    normalizeOllamaModelName,
    subscribeToOllamaDownloads,
    subscribeToOllamaWarmup
} from '../../../services/ollama';
import {
    micBridge,
    notificationBridge,
    resultBridge,
    speechBridge,
    windowBridge,
    localSpeechBridge,
    ollamaBridge
} from '../../../services/winkyBridge';
import {useMicActionHotkeys} from './useMicActionHotkeys';
import {useMicVisibilityMonitor} from './useMicVisibilityMonitor';
import {useActionProcessing} from './useActionProcessing';
import {useVolumeMonitor} from './useVolumeMonitor';
import {useSpeechServiceReadiness} from './useSpeechServiceReadiness';

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
    const autoStartPendingRef = useRef(false);
    const isRecordingRef = useRef(false);
    const processingRef = useRef(false);
    const lastDomActionHotkeyTsRef = useRef(0);
    const lastGlobalActionHotkeyTsRef = useRef(0);
    const handleMicrophoneToggleRef = useRef<(() => Promise<void> | void) | null>(null);
    const completionSoundRef = useRef<HTMLAudioElement | null>(null);
    const localServerAlertInFlightRef = useRef(false);
    const localServerAlertReleaseRef = useRef<number | null>(null);
    const windowVisibleRef = useRef(true);
    const {
        volume,
        startVolumeMonitor,
        stopVolumeMonitor,
        currentStreamRef
    } = useVolumeMonitor({windowVisibleRef});
    const speechMode = config?.speech.mode;
    const speechModel = config?.speech.model;

    const [isRecording, setIsRecording] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [localModelWarmingUp, setLocalModelWarmingUp] = useState(false);
    const [localLlmWarmingUp, setLocalLlmWarmingUp] = useState(false);
    const [localLlmDownloading, setLocalLlmDownloading] = useState(false);

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

    const openMainWindowWithToast = useCallback(async (message: string) => {
        try {
            console.log('[useSpeechRecording] Opening main window for toast:', message);
            try {
                await invoke('window_open_main');
                console.log('[useSpeechRecording] Main window opened via command');
            } catch (invokeError) {
                console.error('[useSpeechRecording] Failed to open main window via command:', invokeError);
                const mainWindow = await WebviewWindow.getByLabel('main').catch(() => null);
                if (mainWindow) {
                    await mainWindow.show().catch(() => {});
                    await mainWindow.setFocus().catch(() => {});
                    console.log('[useSpeechRecording] Main window opened using WebviewWindow API');
                } else {
                    throw new Error('Main window is unavailable');
                }
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
            await emit('app:toast', {
                message,
                type: 'error',
                options: {durationMs: 6000}
            });
        } catch (error) {
            console.error('[useSpeechRecording] Failed to show toast in main window:', error);
            showToast(message, 'error', {durationMs: 6000});
        }
    }, [showToast]);

    const warmUpRecorder = useCallback(async () => {
        if (!recorderRef.current) {
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
            return;
        }
        const canCheckPermissions = typeof navigator.permissions?.query === 'function';
        if (canCheckPermissions) {
            try {
                const status = await navigator.permissions.query({name: 'microphone' as PermissionName});
                if (status.state !== 'granted') {
                    return;
                }
            } catch (error) {
                console.warn('[MicOverlay] Failed to read microphone permission state', error);
                return;
            }
        } else if (!import.meta.env?.DEV) {
            // В продакшене не прогреваем запись, если не можем проверить разрешение
            return;
        }

        try {
            await recorderRef.current.warmUp();
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

    useMicVisibilityMonitor({
        isMicOverlay,
        isRecordingRef,
        currentStreamRef,
        windowVisibleRef,
        startVolumeMonitor,
        stopVolumeMonitor
    });

    useEffect(() => {
        if (speechMode !== SPEECH_MODES.LOCAL || !speechModel) {
            setLocalModelWarmingUp(false);
            return;
        }
        const normalized = normalizeLocalSpeechModelName(speechModel);
        if (!normalized) {
            setLocalModelWarmingUp(false);
        }
        const unsubscribe = subscribeToLocalModelWarmup((activeModels) => {
            if (!normalized) {
                setLocalModelWarmingUp(false);
                return;
            }
            setLocalModelWarmingUp(activeModels.has(normalized));
        });
        return () => {
            unsubscribe();
        };
    }, [speechMode, speechModel]);

    useEffect(() => {
        if (config?.llm.mode !== LLM_MODES.LOCAL) {
            setLocalLlmWarmingUp(false);
            return;
        }
        const normalized = normalizeOllamaModelName(config?.llm.model ?? '');
        if (!normalized) {
            setLocalLlmWarmingUp(false);
            return;
        }
        const unsubscribe = subscribeToOllamaWarmup((models) => {
            setLocalLlmWarmingUp(models.has(normalized));
        });
        return () => {
            unsubscribe();
        };
    }, [config?.llm.mode, config?.llm.model]);

    useEffect(() => {
        if (config?.llm.mode !== LLM_MODES.LOCAL) {
            setLocalLlmDownloading(false);
            return;
        }
        const normalized = normalizeOllamaModelName(config?.llm.model ?? '');
        if (!normalized) {
            setLocalLlmDownloading(false);
            return;
        }
        const unsubscribe = subscribeToOllamaDownloads((models) => {
            setLocalLlmDownloading(models.has(normalized));
        });
        return () => {
            unsubscribe();
        };
    }, [config?.llm.mode, config?.llm.model]);

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
        const failureMessage = 'Local speech server is unavailable. Opening Settings…';
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

    const {ensureSpeechService} = useSpeechServiceReadiness({
        config,
        localModelWarmingUp,
        localLlmDownloading,
        localLlmWarmingUp,
        openMainWindowWithToast,
        showToast,
        isMicOverlay
    });

    const finishRecording = useCallback(async (resetUI: boolean = true): Promise<Blob | null> => {
        if (!recorderRef.current) {
            return null;
        }

        try {
            const blob = await recorderRef.current.stopRecording();
            return blob;
        } catch (error) {
            console.error(error);
            showToast('Failed to stop recording.', 'error');
            return null;
        } finally {
            if (resetUI) {
                setIsRecording(false);
                stopVolumeMonitor();
            }
        }
    }, [showToast, stopVolumeMonitor]);

    const {processAction} = useActionProcessing({
        config,
        showToast,
        handleLocalSpeechServerFailure,
        openMainWindowWithToast,
        completionSoundRef
    });

    const handleMicrophoneToggle = useCallback(async () => {
        const ready = await ensureSpeechService();
        if (!ready) {
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
            } catch (error: any) {
                console.error(error);
                
                // Проверяем тип ошибки доступа к микрофону
                const errorName = error?.name || '';
                const errorMessage = error?.message || '';
                
                if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || 
                    errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
                    showToast(
                        'Microphone access is blocked. Click the mic again and confirm the system prompt. If no dialog appears, enable access in Windows: Settings → Privacy → Microphone.',
                        'error',
                        {durationMs: 9000}
                    );
                } else if (errorName === 'NotFoundError' || errorMessage.includes('No microphone')) {
                    showToast('No microphone detected. Connect one and try again.', 'error');
                } else if (errorName === 'NotReadableError' || errorMessage.includes('could not be read')) {
                    showToast('The microphone is in use by another app. Close it and try again.', 'error');
                } else {
                    showToast('Failed to start recording. Check microphone permissions in Windows settings.', 'error');
                }
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
        if (processingRef.current || processing || !isRecordingRef.current || !isRecording) {
            return;
        }

        const ready = await ensureSpeechService();
        if (!ready) {
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

    useMicActionHotkeys({
        activeActions,
        isMicOverlay,
        isRecording,
        isRecordingRef,
        handleActionClick,
        lastDomActionHotkeyTsRef,
        lastGlobalActionHotkeyTsRef
    });

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
