import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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

const FALLBACK_SOUND_PATH = '/sounds/completion.wav';

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
    const [soundPath, setSoundPath] = useState<string>(FALLBACK_SOUND_PATH);

    useEffect(() => {
        setCompletionEnabled(config?.completionSoundEnabled !== false);
    }, [config?.completionSoundEnabled]);

    useEffect(() => {
        if (!completionEnabled) {
            setSoundPath('');
            return;
        }

        if (import.meta.env?.DEV) {
            setSoundPath(FALLBACK_SOUND_PATH);
            return;
        }

        let cancelled = false;
        const resolveSoundPath = async () => {
            try {
                const path = await resourcesBridge.getSoundPath('completion.wav');
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
                } else {
                    console.warn('[MicOverlay] Sound path not available, using bundled fallback');
                }
            } catch (error) {
                console.warn('[MicOverlay] Failed to get sound path, using fallback asset:', error);
            }
            if (!cancelled) {
                setSoundPath(FALLBACK_SOUND_PATH);
            }
        };

        void resolveSoundPath();

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

    const handleAudioError = useCallback(() => {
        if (!completionEnabled) {
            return;
        }
        setSoundPath((current) => {
            if (!current) {
                console.warn('[MicOverlay] Completion sound missing, using bundled fallback asset');
                return FALLBACK_SOUND_PATH;
            }
            if (current === FALLBACK_SOUND_PATH) {
                console.warn('[MicOverlay] Bundled completion sound is unavailable or unsupported.');
                return current;
            }
            console.warn('[MicOverlay] Failed to load resource sound, falling back to bundled asset');
            return FALLBACK_SOUND_PATH;
        });
    }, [completionEnabled]);

    return (
        <>
            {completionEnabled && soundPath ? (
                <audio ref={completionSoundRef} src={soundPath} preload="auto" onError={handleAudioError}/>
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
