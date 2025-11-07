import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ActionConfig, AppConfig} from '@shared/types';
import type {BaseSpeechService} from '@main/services/speech/BaseSpeechService';
import type {BaseLLMService} from '@main/services/llm/BaseLLMService';
import {createSpeechService} from '@main/services/speech/factory';
import {createLLMService} from '@main/services/llm/factory';
import {resetInteractive} from '../../../utils/interactive';

type ToastFn = (message: string, type?: 'success' | 'info' | 'error') => void;

type UseSpeechRecordingParams = {
    config: AppConfig | null;
    showToast: ToastFn;
    isMicOverlay: boolean;
};

export const useSpeechRecording = ({config, showToast, isMicOverlay}: UseSpeechRecordingParams) => {
    const speechServiceRef = useRef<BaseSpeechService | null>(null);
    const llmServiceRef = useRef<BaseLLMService | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const autoStartPendingRef = useRef(false);
    const isRecordingRef = useRef(false);
    const processingRef = useRef(false);
    const handleMicrophoneToggleRef = useRef<(() => Promise<void> | void) | null>(null);
    const completionSoundRef = useRef<HTMLAudioElement | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [volume, setVolume] = useState(0);

    useEffect(() => {
        if (!config) {
            return;
        }

        const accessToken = config.auth.access || config.auth.accessToken || undefined;

        try {
            speechServiceRef.current = createSpeechService(config.speech.mode, config.speech.model, {
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google
            });
        } catch (error) {
            console.error('[MicOverlay] Не удалось создать сервис распознавания', error);
            speechServiceRef.current = null;
        }

        try {
            llmServiceRef.current = createLLMService(config.llm.mode, config.llm.model, {
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken
            });
        } catch (error) {
            console.error('[MicOverlay] Не удалось создать LLM сервис', error);
            llmServiceRef.current = null;
        }
    }, [config]);

    const startVolumeMonitor = useCallback((stream: MediaStream) => {
        stopVolumeMonitor();
        try {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            const buffer = new Uint8Array(analyser.fftSize);

            const update = () => {
                analyser.getByteTimeDomainData(buffer);
                let sumSquares = 0;
                for (let i = 0; i < buffer.length; i += 1) {
                    const deviation = buffer[i] - 128;
                    sumSquares += deviation * deviation;
                }
                const rms = Math.sqrt(sumSquares / buffer.length) / 128;
                setVolume(Number.isFinite(rms) ? rms : 0);
                animationFrameRef.current = requestAnimationFrame(update);
            };

            update();
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
        } catch (error) {
            console.error('[MicOverlay] Не удалось инициализировать визуализацию микрофона', error);
        }
    }, []);

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
    }, []);

    const ensureSpeechService = useCallback(() => {
        if (!speechServiceRef.current) {
            showToast('Сервис записи недоступен.', 'error');
            return false;
        }
        return true;
    }, [showToast]);

    const finishRecording = useCallback(async (resetUI: boolean = true): Promise<Blob | null> => {
        if (!speechServiceRef.current) {
            return null;
        }

        try {
            const blob = await speechServiceRef.current.stopRecording();
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

            const transcription = await window.winky?.speech.transcribe(arrayBuffer, {
                mode: config.speech.mode,
                model: config.speech.model,
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: authToken
            });

            if (!transcription) {
                showToast('Не удалось распознать речь для действия.', 'error');
                return;
            }

            if (action.show_results) {
                await window.winky?.result.open();
                await new Promise(resolve => setTimeout(resolve, 200));
                await window.winky?.result.update({transcription, llmResponse: '', isStreaming: false});
            }

            if (!action.prompt || action.prompt.trim() === '') {
                if (action.auto_copy_result) {
                    await window.winky?.clipboard.writeText(transcription);
                    showToast('Результат скопирован.', 'success');
                }
                if (action.show_results) {
                    await window.winky?.result.update({llmResponse: transcription, isStreaming: false});
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

            const response = await window.winky?.llm.process(transcription, action.prompt, llmConfig) || '';

            if (action.show_results) {
                await window.winky?.result.update({llmResponse: response, isStreaming: false});
            }

            if (action.auto_copy_result) {
                await window.winky?.clipboard.writeText(response);
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
            showToast(error?.message || 'Ошибка при обработке действия.', 'error');
        }
    }, [config, showToast]);

    const handleMicrophoneToggle = useCallback(async () => {
        if (!ensureSpeechService()) {
            return;
        }

        if (!isRecording) {
            try {
                const stream = await speechServiceRef.current?.startRecording();
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
                void window.winky?.mic?.hide({reason: 'action'});
            }
        }
    }, [ensureSpeechService, finishRecording, isRecording, showToast, startVolumeMonitor, isMicOverlay, config?.micHideOnStopRecording]);

    const handleActionClick = useCallback(async (action: ActionConfig) => {
        if (processing || !isRecording || !ensureSpeechService()) {
            return;
        }

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
            setProcessing(false);
            resetInteractive();
            if (isMicOverlay && config?.micHideOnStopRecording !== false) {
                void window.winky?.mic?.hide({reason: 'action'});
            }
        }
    }, [processing, isRecording, ensureSpeechService, finishRecording, processAction, stopVolumeMonitor, isMicOverlay, config?.micHideOnStopRecording]);

    const actions = useMemo<ActionConfig[]>(() => config?.actions ?? [], [config?.actions]);
    const displayedActions = useMemo<ActionConfig[]>(() => {
        if (!isRecording || actions.length === 0) {
            return [];
        }
        const MAX_FLOATING_ACTIONS = 6;
        return actions.slice(0, MAX_FLOATING_ACTIONS);
    }, [actions, isRecording]);

    const normalizedVolume = Math.min(volume * 2.5, 1);

    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    useEffect(() => {
        processingRef.current = processing;
    }, [processing]);

    useEffect(() => {
        handleMicrophoneToggleRef.current = handleMicrophoneToggle;
    }, [handleMicrophoneToggle]);

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
            setActiveActionId
        }
    };
};
