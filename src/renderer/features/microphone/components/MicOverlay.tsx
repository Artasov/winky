import React, {useEffect, useMemo, useRef, useState} from 'react';
import {convertFileSrc} from '@tauri-apps/api/core';
import MicrophoneButton from '../../../components/MicrophoneButton';
import LoadingSpinner from '../../../components/LoadingSpinner';
import {useConfig} from '../../../context/ConfigContext';
import {useToast} from '../../../context/ToastContext';
import {useSpeechRecording} from '../hooks/useSpeechRecording';
import {useMicOverlayInteractions} from '../hooks/useMicOverlayInteractions';
import {useMicWindowEffects} from '../hooks/useMicWindowEffects';
import {useMicInteractiveProximity} from '../hooks/useMicInteractiveProximity';
import MicDragHandle from './MicDragHandle';
import MicVolumeRings from './MicVolumeRings';
import MicActionOrbit from './MicActionOrbit';
import {interactiveEnter, interactiveLeave, resetInteractive} from '../../../utils/interactive';
import {resourcesBridge} from '../../../services/winkyBridge';

const MicOverlay: React.FC = () => {
    const {config} = useConfig();
    const {showToast} = useToast();

    const isMicOverlay = useMemo(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        const params = new URLSearchParams(window.location.search);
        return params.get('window') === 'mic';
    }, []);

    const recording = useSpeechRecording({config, showToast, isMicOverlay});
    const interactions = useMicOverlayInteractions({isMicOverlay});
    const {view, refs, handlers} = recording;
    const {
        isRecording,
        processing,
        activeActionId,
        displayedActions,
        actionsVisible,
        normalizedVolume
    } = view;
    const {
        autoStartPendingRef,
        isRecordingRef,
        processingRef,
        handleMicrophoneToggleRef,
        completionSoundRef
    } = refs;
    const {
        handleMicrophoneToggle,
        handleActionClick,
        finishRecording,
        setActiveActionId,
        warmUpRecorder
    } = handlers;

    const micButtonRef = useRef<HTMLDivElement | null>(null);
    const actionsContainerRef = useRef<HTMLDivElement | null>(null);

    const [completionEnabled, setCompletionEnabled] = useState<boolean>(true);
    const [soundPath, setSoundPath] = useState<string>('/sounds/completion.wav');

    useEffect(() => {
        setCompletionEnabled(config?.completionSoundEnabled !== false);
    }, [config?.completionSoundEnabled]);

    useEffect(() => {
        if (!completionEnabled) {
            setSoundPath('');
            return;
        }

        if (import.meta.env?.DEV) {
            setSoundPath('/sounds/completion.wav');
            return;
        }

        let cancelled = false;
        resourcesBridge
            .getSoundPath('completion.wav')
            .then((path) => {
                if (cancelled) {
                    return;
                }
                if (path) {
                    try {
                        const fileUrl = convertFileSrc(path);
                        setSoundPath(fileUrl);
                        return;
                    } catch (error) {
                        console.warn('[MicOverlay] Failed to convert sound path:', error);
                    }
                }
                // В продакшене не используем HTTP fallback, так как это вызывает ошибки
                console.warn('[MicOverlay] Sound path not available, disabling sound');
                setSoundPath('');
            })
            .catch((error) => {
                console.warn('[MicOverlay] Failed to get sound path:', error);
                if (!cancelled) {
                    // В продакшене не используем HTTP fallback, так как это вызывает ошибки
                    setSoundPath('');
                }
            });

        return () => {
            cancelled = true;
        };
    }, [completionEnabled]);

    useMicWindowEffects({
        isMicOverlay,
        autoStartPendingRef,
        isRecordingRef,
        processingRef,
        handleMicrophoneToggleRef,
        finishRecording,
        setActiveActionId,
        warmUpRecorder
    });

    useMicInteractiveProximity({
        isMicOverlay,
        micButtonRef,
        actionsContainerRef,
        actionsEnabled: actionsVisible && displayedActions.length > 0 && !processing
    });

    // Сбрасываем состояние интерактивности при монтировании компонента
    useEffect(() => {
        if (isMicOverlay) {
            resetInteractive();
        }
    }, [isMicOverlay]);

    useEffect(() => {
        if (!completionSoundRef.current) {
            return;
        }
        const volumePreference = typeof config?.completionSoundVolume === 'number' ? config.completionSoundVolume : 1;
        completionSoundRef.current.volume = volumePreference;
    }, [config?.completionSoundVolume]);

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

    return (
        <>
            {completionEnabled && soundPath ? (
                <audio ref={completionSoundRef} src={soundPath} preload='auto'/>
            ) : (
                <audio ref={completionSoundRef} />
            )}
            <MicDragHandle interactions={interactions} isRecording={isRecording} disabled={processing}/>
            <div className="pointer-events-none relative flex h-full w-full items-center justify-center">
                <MicVolumeRings isRecording={isRecording} normalizedVolume={normalizedVolume}/>
                <div
                    className="relative"
                    style={{pointerEvents: processing ? 'none' : 'auto'}}
                    ref={micButtonRef}
                >
                    <MicrophoneButton
                        isRecording={isRecording}
                        onToggle={handleMicrophoneToggle}
                        disabled={processing}
                        size={isRecording ? 'compact' : 'default'}
                    />
                </div>
                <div
                    ref={actionsContainerRef}
                    className="pointer-events-none absolute inset-0"
                >
                    <MicActionOrbit
                        actions={displayedActions}
                        actionsVisible={actionsVisible}
                        processing={processing}
                        activeActionId={activeActionId}
                        onActionClick={handleActionClick}
                    />
                </div>
            </div>
        </>
    );
};

export default MicOverlay;
