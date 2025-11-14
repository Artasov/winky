import React, {useEffect, useMemo} from 'react';
import type {AppConfig} from '@shared/types';
import MicrophoneButton from '../../../components/MicrophoneButton';
import LoadingSpinner from '../../../components/LoadingSpinner';
import {useConfig} from '../../../context/ConfigContext';
import {useToast} from '../../../context/ToastContext';
import {useSpeechRecording} from '../hooks/useSpeechRecording';
import {useMicOverlayInteractions} from '../hooks/useMicOverlayInteractions';
import {useMicWindowEffects} from '../hooks/useMicWindowEffects';
import MicDragHandle from './MicDragHandle';
import MicVolumeRings from './MicVolumeRings';
import MicActionOrbit from './MicActionOrbit';

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

    useEffect(() => {
        if (!completionSoundRef.current) {
            return;
        }
        const volumePreference = typeof config?.completionSoundVolume === 'number' ? config.completionSoundVolume : 1;
        completionSoundRef.current.volume = volumePreference;
    }, [config?.completionSoundVolume]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const applyVolume = (volume?: number) => {
            if (!completionSoundRef.current) {
                return;
            }
            const normalized = typeof volume === 'number' ? volume : 1;
            completionSoundRef.current.volume = normalized;
        };

        const loadInitial = async () => {
            try {
                const currentConfig: AppConfig | undefined = await window.winky?.config?.get?.();
                applyVolume(currentConfig?.completionSoundVolume);
            } catch {
                applyVolume();
            }
        };

        void loadInitial();

        const subscribe = window.winky?.config?.subscribe;
        if (!subscribe) {
            return;
        }
        const unsubscribe = subscribe((nextConfig: AppConfig) => {
            applyVolume(nextConfig?.completionSoundVolume);
        });
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
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

    return (
        <>
            <audio ref={completionSoundRef} src='/sounds/completion.wav' preload='auto'/>
            <MicDragHandle interactions={interactions} isRecording={isRecording} disabled={processing}/>
            <div className="pointer-events-none relative flex h-full w-full items-center justify-center">
                <MicVolumeRings isRecording={isRecording} normalizedVolume={normalizedVolume}/>
                <div
                    className="relative"
                    style={{pointerEvents: processing ? 'none' : 'auto'}}
                >
                    <MicrophoneButton
                        isRecording={isRecording}
                        onToggle={handleMicrophoneToggle}
                        disabled={processing}
                        size={isRecording ? 'compact' : 'default'}
                    />
                </div>
                <MicActionOrbit
                    actions={displayedActions}
                    actionsVisible={actionsVisible}
                    processing={processing}
                    activeActionId={activeActionId}
                    onActionClick={handleActionClick}
                />
            </div>
        </>
    );
};

export default MicOverlay;
