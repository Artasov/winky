import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ActionConfig} from '@shared/types';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import MicrophoneButton from '../components/MicrophoneButton';
import ActionButton from '../components/ActionButton';
import LoadingSpinner from '../components/LoadingSpinner';
import type {BaseSpeechService} from '@main/services/speech/BaseSpeechService';
import type {BaseLLMService} from '@main/services/llm/BaseLLMService';
import {createSpeechService} from '@main/services/speech/factory';
import {createLLMService} from '@main/services/llm/factory';
import {interactiveEnter, interactiveLeave, resetInteractive} from '../utils/interactive';

const MainWindow: React.FC = () => {
    const {config} = useConfig();
    const {showToast} = useToast();
    const isMicOverlay = useMemo(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        const params = new URLSearchParams(window.location.search);
        return params.get('window') === 'mic';
    }, []);
    const speechServiceRef = useRef<BaseSpeechService | null>(null);
    const llmServiceRef = useRef<BaseLLMService | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [volume, setVolume] = useState(0);
    const completionSoundRef = useRef<HTMLAudioElement | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const autoStartPendingRef = useRef(false);
    const isRecordingRef = useRef(false);
    const processingRef = useRef(false);
    const handleMicrophoneToggleRef = useRef<(() => Promise<void> | void) | null>(null);
    const dragPointerIdRef = useRef<number | null>(null);
    const dragPointerCleanupRef = useRef<(() => void) | null>(null);
    const suppressedHandleLeaveRef = useRef(false);
    const dragHandleRef = useRef<HTMLDivElement | null>(null);
    const handleHoveringRef = useRef(false);

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
            console.error('[MainWindow] Не удалось создать сервис распознавания', error);
            speechServiceRef.current = null;
        }

        try {
            llmServiceRef.current = createLLMService(config.llm.mode, config.llm.model, {
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken
            });
        } catch (error) {
            console.error('[MainWindow] Не удалось создать LLM сервис', error);
            llmServiceRef.current = null;
        }
    }, [config]);

    const actions = useMemo<ActionConfig[]>(() => config?.actions ?? [], [config?.actions]);
    const displayedActions = useMemo<ActionConfig[]>(() => {
        if (!isRecording || actions.length === 0) {
            return [];
        }
        const MAX_FLOATING_ACTIONS = 6;
        return actions.slice(0, MAX_FLOATING_ACTIONS);
    }, [actions, isRecording]);
    const actionsVisible = displayedActions.length > 0;

    const startVolumeMonitor = (stream: MediaStream) => {
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
            console.error('[MainWindow] Не удалось инициализировать визуализацию микрофона', error);
        }
    };

    const stopVolumeMonitor = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = undefined;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => undefined);
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        setVolume(0);
    };

    useEffect(() => () => {
        stopVolumeMonitor();
    }, []);

    useEffect(() => () => {
        dragPointerCleanupRef.current?.();
    }, []);

    if (!config) {
        return (
            <div className="pointer-events-none relative flex h-full w-full items-center justify-center">
                <div
                    className="pointer-events-auto flex flex-col items-center gap-4 rounded-2xl bg-white/95 backdrop-blur-sm px-8 py-6 shadow-lg">
                    <LoadingSpinner size="medium"/>
                    <p className="text-sm font-medium text-text-secondary animate-pulse">Loading...</p>
                </div>
            </div>
        );
    }

    const authToken = config.auth.access || config.auth.accessToken || undefined;

    const ensureSpeechService = () => {
        if (!speechServiceRef.current) {
            showToast('Сервис записи недоступен.', 'error');
            return false;
        }
        return true;
    };

    const ensureLLMService = () => {
        if (!llmServiceRef.current) {
            showToast('LLM сервис недоступен.', 'error');
            return false;
        }
        return true;
    };

    const finishRecording = async (resetUI: boolean = true): Promise<Blob | null> => {
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
    };

    const processAction = async (action: ActionConfig, blob: Blob) => {
        try {
            // Преобразуем Blob в ArrayBuffer для передачи через IPC
            const arrayBuffer = await blob.arrayBuffer();

            // Вызываем транскрипцию через IPC (в main process)
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

            // Если show_results включен, открываем окно результатов сразу после транскрипции
            if (action.show_results) {
                await window.winky?.result.open();
                // Небольшая задержка чтобы окно успело загрузиться
                await new Promise(resolve => setTimeout(resolve, 200));
                console.log('[MainWindow] Sending transcription to result window:', transcription);
                await window.winky?.result.update({transcription, llmResponse: '', isStreaming: false});
            }

            // Если prompt пустой, результат = транскрипция
            if (!action.prompt || action.prompt.trim() === '') {
                if (action.auto_copy_result) {
                    await window.winky?.clipboard.writeText(transcription);
                    showToast('Результат скопирован.', 'success');
                }

                if (action.show_results) {
                    await window.winky?.result.update({llmResponse: transcription, isStreaming: false});
                }

                if (action.sound_on_complete && completionSoundRef.current) {
                    const volume = config?.completionSoundVolume ?? 1.0;
                    if (volume > 0) {
                        console.log('[MainWindow] Playing completion sound at volume:', volume);
                        completionSoundRef.current.volume = volume;
                        completionSoundRef.current.play().catch((error) => {
                            console.error('[MainWindow] Error playing sound:', error);
                        });
                    }
                }

                return;
            }

            // Обрабатываем через LLM (в main process)
            const llmConfig = {
                mode: config.llm.mode,
                model: config.llm.model,
                openaiKey: config.apiKeys.openai,
                googleKey: config.apiKeys.google,
                accessToken: authToken
            };

            let response = '';

            // TODO: Реализовать стриминг через IPC events
            // Пока используем обычный process
            response = await window.winky?.llm.process(transcription, action.prompt, llmConfig) || '';

            if (action.show_results) {
                await window.winky?.result.update({llmResponse: response, isStreaming: false});
            }

            console.debug('[MainWindow] action processed', {actionId: action.id, responseLength: response.length});

            if (action.auto_copy_result) {
                await window.winky?.clipboard.writeText(response);
                showToast('Ответ скопирован.', 'success');
            }

            if (action.sound_on_complete && completionSoundRef.current) {
                const volume = config?.completionSoundVolume ?? 1.0;
                if (volume > 0) {
                    console.log('[MainWindow] Playing completion sound (after LLM) at volume:', volume);
                    completionSoundRef.current.volume = volume;
                    completionSoundRef.current.play().catch((error) => {
                        console.error('[MainWindow] Error playing sound:', error);
                    });
                }
            }

        } catch (error: any) {
            console.error(error);
            showToast(error?.message || 'Ошибка при обработке действия.', 'error');
        }
    };

    const handleMicrophoneToggle = async () => {
        console.debug('[MainWindow] microphone toggle requested', {isRecording, processing});
        if (!ensureSpeechService()) {
            return;
        }

        if (!isRecording) {
            try {
                const stream = await speechServiceRef.current?.startRecording();
                console.debug('[MainWindow] recording started', {hasStream: Boolean(stream)});
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

        // Просто останавливаем запись без транскрипции (отмена)
        try {
            await finishRecording();
        } finally {
            setActiveActionId(null);
            resetInteractive();
            if (isMicOverlay && config?.micHideOnStopRecording !== false) {
                void window.winky?.mic?.hide({reason: 'action'});
            }
        }
    };

    const handleActionClick = useCallback(async (action: ActionConfig) => {
        console.debug('[MainWindow] action requested', {actionId: action.id, isRecording, processing});
        if (processing || !isRecording) {
            return;
        }

        if (!ensureSpeechService()) {
            return;
        }

        setActiveActionId(action.id);
        setProcessing(true);
        try {
            // Останавливаем запись, но не меняем UI (isRecording остается true)
            const blob = await finishRecording(false);
            if (blob) {
                await processAction(action, blob);
            }
        } finally {
            // Только сейчас возвращаем изначальный вид
            setIsRecording(false);
            stopVolumeMonitor();
            setActiveActionId(null);
            setProcessing(false);
            // Сбрасываем интерактивность окна, чтобы клики проходили сквозь прозрачные области
            resetInteractive();
            if (isMicOverlay && config?.micHideOnStopRecording !== false) {
                void window.winky?.mic?.hide({reason: 'action'});
            }
        }
    }, [isRecording, processing, isMicOverlay, config?.micHideOnStopRecording]);

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

    const handleHandleMouseEnter = useCallback(() => {
        if (handleHoveringRef.current) {
            return;
        }
        handleHoveringRef.current = true;
        if (suppressedHandleLeaveRef.current) {
            suppressedHandleLeaveRef.current = false;
            return;
        }
        interactiveEnter();
    }, []);

    const handleHandleMouseLeave = useCallback(() => {
        if (!handleHoveringRef.current) {
            return;
        }
        if (dragPointerIdRef.current !== null) {
            suppressedHandleLeaveRef.current = true;
            return;
        }
        handleHoveringRef.current = false;
        interactiveLeave();
    }, []);

    const handleHandlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        dragPointerCleanupRef.current?.();

        const pointerId = event.pointerId;
        dragPointerIdRef.current = pointerId;
        handleHandleMouseEnter();

        function cleanupPointerListeners() {
            window.removeEventListener('pointerup', handlePointerEnd, true);
            window.removeEventListener('pointercancel', handlePointerEnd, true);
            if (dragPointerIdRef.current === pointerId) {
                dragPointerIdRef.current = null;
            }
            handleHoveringRef.current = false;
            interactiveLeave();
            if (suppressedHandleLeaveRef.current) {
                suppressedHandleLeaveRef.current = false;
                interactiveLeave();
            }
            dragPointerCleanupRef.current = null;
        }

        function handlePointerEnd(pointerEvent: PointerEvent) {
            if (pointerEvent.pointerId !== pointerId) {
                return;
            }
            cleanupPointerListeners();
        }

        dragPointerCleanupRef.current = cleanupPointerListeners;

        window.addEventListener('pointerup', handlePointerEnd, true);
        window.addEventListener('pointercancel', handlePointerEnd, true);
    }, [handleHandleMouseEnter]);

    useEffect(() => {
        if (!isMicOverlay) {
            return;
        }

        const api = window.winky;
        if (!api?.on) {
            return;
        }

        const startHandler = () => {
            if (autoStartPendingRef.current || isRecordingRef.current || processingRef.current) {
                return;
            }
            const toggle = handleMicrophoneToggleRef.current;
            if (!toggle) {
                return;
            }
            autoStartPendingRef.current = true;
            Promise.resolve(toggle()).finally(() => {
                autoStartPendingRef.current = false;
            });
        };

        const visibilityHandler = (_event: unknown, payload: { visible: boolean }) => {
            if (!payload?.visible) {
                // Отключаем автозапуск при скрытии
                autoStartPendingRef.current = false;
                // Если запись шла — корректно останавливаем её при скрытии окна (например, хоткеем)
                if (isRecordingRef.current) {
                    (async () => {
                        try {
                            await finishRecording();
                        } finally {
                            setActiveActionId(null);
                            resetInteractive();
                        }
                    })();
                }
            }
        };

        api.on('mic:start-recording', startHandler);
        api.on('mic:visibility-change', visibilityHandler);
        return () => {
            api.removeListener?.('mic:start-recording', startHandler);
            api.removeListener?.('mic:visibility-change', visibilityHandler);
        };
    }, [isMicOverlay]);

    useEffect(() => {
        if (!isMicOverlay) {
            return;
        }
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const pollCursor = async () => {
            if (cancelled) {
                return;
            }
            if (dragPointerIdRef.current !== null) {
                timeoutId = setTimeout(pollCursor, 120);
                return;
            }
            const handleElement = dragHandleRef.current;
            const micApi = window.winky?.mic;
            if (!handleElement || !micApi?.getCursorPosition) {
                timeoutId = setTimeout(pollCursor, 200);
                return;
            }
            try {
                const cursor = await micApi.getCursorPosition();
                const rect = handleElement.getBoundingClientRect();
                const padding = 6;
                const left = (window.screenX || 0) + rect.left - padding;
                const top = (window.screenY || 0) + rect.top - padding;
                const right = (window.screenX || 0) + rect.right + padding;
                const bottom = (window.screenY || 0) + rect.bottom + padding;
                const inside = cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom;
                if (inside) {
                    handleHandleMouseEnter();
                } else if (handleHoveringRef.current && dragPointerIdRef.current === null) {
                    handleHandleMouseLeave();
                }
            } catch {
                // ignore polling errors
            } finally {
                timeoutId = setTimeout(pollCursor, 40);
            }
        };

        pollCursor();

        return () => {
            cancelled = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [isMicOverlay, handleHandleMouseEnter, handleHandleMouseLeave]);

    // Обработка hotkeys для действий во время записи
    useEffect(() => {
        if (!isRecording || !config?.actions) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            // Игнорируем если фокус в input/textarea
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }

            // Создаем строку hotkey из нажатых клавиш
            const modifiers: string[] = [];
            if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
            if (event.altKey) modifiers.push('Alt');
            if (event.shiftKey) modifiers.push('Shift');

            // Получаем основную клавишу
            let key = event.key;
            if (key.length === 1) {
                key = key.toUpperCase();
            } else if (key === ' ') {
                key = 'Space';
            }

            // Игнорируем если нажата только модификаторная клавиша
            if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
                return;
            }

            // Формируем строку hotkey
            const hotkeyString = [...modifiers, key].join('+');

            // Ищем действие с таким hotkey
            const action = config.actions.find(a => {
                if (!a.hotkey) return false;
                // Нормализуем hotkey для сравнения
                const normalizedActionHotkey = a.hotkey.trim().replace(/\s+/g, '');
                const normalizedEventHotkey = hotkeyString.replace(/\s+/g, '');
                return normalizedActionHotkey.toLowerCase() === normalizedEventHotkey.toLowerCase();
            });

            if (action) {
                event.preventDefault();
                event.stopPropagation();
                console.log('[MainWindow] Hotkey triggered:', hotkeyString, 'for action:', action.name);
                void handleActionClick(action);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isRecording, config?.actions, handleActionClick]);

    const handleStyle = useMemo(() => ({
        pointerEvents: 'auto' as const,
        top: isRecording ? 'calc(50% - 34px)' : 'calc(50% - 56px)',
        opacity: isRecording ? 1 : 0.92,
        transition: 'top 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease'
    }), [isRecording]);

    const actionsWrapperStyle = useMemo(() => ({
        width: 0,
        height: 0,
        opacity: actionsVisible ? 1 : 0,
        pointerEvents: actionsVisible ? 'auto' as const : 'none' as const,
        transform: `translate(-50%, -50%) scale(${actionsVisible ? 1 : 0.85})`,
        transition: 'opacity 220ms ease, transform 240ms ease'
    }), [actionsVisible]);

    const actionsAuraStyle = useMemo(() => ({
        opacity: actionsVisible ? 1 : 0,
        transform: `scale(${actionsVisible ? 1 : 0.85})`,
        transition: 'opacity 220ms ease, transform 240ms ease'
    }), [actionsVisible]);

    // Обработка fade-in/fade-out анимаций
    useEffect(() => {
        const handleFadeIn = () => {
            document.body.classList.remove('fade-out');
            document.body.classList.add('fade-in');
        };

        const handleFadeOut = () => {
            document.body.classList.remove('fade-in');
            document.body.classList.add('fade-out');
        };

        const api = window.winky;
        if (!api?.on) {
            return;
        }

        api.on('mic:start-fade-in', handleFadeIn);
        api.on('mic:start-fade-out', handleFadeOut);

        return () => {
            api.removeListener?.('mic:start-fade-in', handleFadeIn);
            api.removeListener?.('mic:start-fade-out', handleFadeOut);
        };
    }, []);

    return (
        <>
            <audio ref={completionSoundRef} src='/sounds/completion.wav' preload='auto'/>

            {/* Палочки для перетаскивания - на верхнем уровне, позиционированы относительно центра */}
            <div
                className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-50 cursor-move select-none app-region-drag"
                style={handleStyle}
                ref={dragHandleRef}
                onMouseEnter={handleHandleMouseEnter}
                onMouseLeave={handleHandleMouseLeave}
                onPointerDown={handleHandlePointerDown}
                title="Перетащить микрофон"
                role="presentation"
                aria-hidden="true"
            >
                <span className="h-[2px] w-6 rounded-full bg-[#ffffff43]"/>
                <span className="h-[2px] w-6 rounded-full bg-[#ffffff43]"/>
            </div>

            <div className="pointer-events-none relative flex h-full w-full items-center justify-center">
                {/* Волны звука вокруг микрофона */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center"
                     style={{overflow: 'visible'}}>
                    {[4, 3, 2, 1].map((multiplier) => (
                        <div
                            key={multiplier}
                            className="absolute rounded-full border-[3px]"
                            style={{
                                width: `${60 + multiplier * 20}px`,
                                height: `${60 + multiplier * 20}px`,
                                borderColor: isRecording ? `rgba(239, 68, 68, ${0.7 - multiplier * 0.1})` : 'rgba(16, 185, 129, 0.5)',
                                opacity: isRecording ? Math.max(0, normalizedVolume - (multiplier - 1) * 0.15) : 0,
                                transform: `scale(${isRecording ? 1 + normalizedVolume * 0.4 : 0.8})`,
                                boxShadow: isRecording
                                    ? `0 0 ${15 + normalizedVolume * 30}px ${5 + normalizedVolume * 15}px rgba(239, 68, 68, ${0.5 + normalizedVolume * 0.3})`
                                    : 'none',
                                transition: 'opacity 0.12s ease, transform 0.12s ease'
                            }}
                        />
                    ))}
                </div>

                <div className="pointer-events-auto relative">
                    <MicrophoneButton
                        isRecording={isRecording}
                        onToggle={handleMicrophoneToggle}
                        disabled={processing}
                        size={isRecording ? 'compact' : 'default'}
                    />
                </div>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div
                        className="pointer-events-none absolute rounded-full bg-rose-500/20 blur-md"
                        style={{width: '64px', height: '64px', ...actionsAuraStyle}}
                    />
                    <div
                        className="absolute left-1/2 top-1/2"
                        style={actionsWrapperStyle}
                    >
                        {displayedActions.map((action, index) => {
                            const total = displayedActions.length;
                            const angleStep = total <= 2 ? 50 : total <= 4 ? 42 : 36;
                            const radius = total <= 2 ? 38 : total <= 4 ? 44 : 50;
                            const startAngle = 90; // начинаем снизу
                            const angleDeg = startAngle - angleStep * index;
                            const angleRad = (angleDeg * Math.PI) / 180;
                            const offsetX = Math.cos(angleRad) * radius;
                            const offsetY = Math.sin(angleRad) * radius;
                            return (
                                <div
                                    key={action.id}
                                    className="pointer-events-auto absolute transition-transform duration-200"
                                    style={{
                                        left: 0,
                                        top: 0,
                                        transform: `translate(${offsetX}px, ${offsetY}px) translate(-50%, -50%)`
                                    }}
                                >
                                    <ActionButton
                                        action={action}
                                        onClick={handleActionClick}
                                        disabled={processing && activeActionId !== action.id}
                                        isActive={activeActionId === action.id}
                                        isLoading={processing && activeActionId === action.id}
                                        variant="floating"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
};

export default MainWindow;
