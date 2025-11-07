import React, {useMemo, useEffect} from 'react';
import MicrophoneButton from '../../../components/MicrophoneButton';
import ActionButton from '../../../components/ActionButton';
import LoadingSpinner from '../../../components/LoadingSpinner';
import {useConfig} from '../../../context/ConfigContext';
import {useToast} from '../../../context/ToastContext';
import {useSpeechRecording} from '../hooks/useSpeechRecording';
import {useMicOverlayInteractions} from '../hooks/useMicOverlayInteractions';
import {useMicWindowEffects} from '../hooks/useMicWindowEffects';

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

    useMicWindowEffects({
        isMicOverlay,
        autoStartPendingRef: recording.refs.autoStartPendingRef,
        isRecordingRef: recording.refs.isRecordingRef,
        processingRef: recording.refs.processingRef,
        handleMicrophoneToggleRef: recording.refs.handleMicrophoneToggleRef,
        finishRecording: recording.handlers.finishRecording,
        setActiveActionId: recording.handlers.setActiveActionId
    });

    useEffect(() => {
        if (!config) {
            return;
        }

        const handler = (event: KeyboardEvent) => {
            if (!recording.view.isRecording || recording.view.displayedActions.length === 0) {
                return;
            }
            const action = config.actions.find((a) => {
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
            if (action) {
                event.preventDefault();
                event.stopPropagation();
                void recording.handlers.handleActionClick(action);
            }
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [config, recording.view.isRecording, recording.view.displayedActions, recording.handlers]);

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

    const handleStyle = {
        pointerEvents: 'auto' as const,
        top: recording.view.isRecording ? 'calc(50% - 34px)' : 'calc(50% - 56px)',
        opacity: recording.view.isRecording ? 1 : 0.92,
        transition: 'top 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease'
    };

    const actionsWrapperStyle = {
        width: 0,
        height: 0,
        opacity: recording.view.actionsVisible ? 1 : 0,
        pointerEvents: recording.view.actionsVisible ? 'auto' as const : 'none' as const,
        transform: `translate(-50%, -50%) scale(${recording.view.actionsVisible ? 1 : 0.85})`,
        transition: 'opacity 220ms ease, transform 240ms ease'
    };

    const actionsAuraStyle = {
        opacity: recording.view.actionsVisible ? 1 : 0,
        transform: `scale(${recording.view.actionsVisible ? 1 : 0.85})`,
        transition: 'opacity 220ms ease, transform 240ms ease'
    };

    return (
        <>
            <audio ref={recording.refs.completionSoundRef} src='/sounds/completion.wav' preload='auto'/>
            <div
                className="absolute left-1/2 -translate-x-1/2 z-50 cursor-move select-none app-region-drag flex items-center justify-center"
                style={handleStyle}
                ref={interactions.dragHandleRef}
                onMouseEnter={interactions.handleHandleMouseEnter}
                onMouseLeave={interactions.handleHandleMouseLeave}
                onPointerDown={interactions.handleHandlePointerDown}
                title="Перетащить микрофон"
                role="presentation"
                aria-hidden="true"
            >
                <svg
                    width={30}
                    height={10}
                    viewBox="0 0 25 10"
                    className="pointer-events-none text-white/55 drop-shadow-[0_0_4px_rgba(0,0,0,0.35)]"
                >
                    <rect x="0" y="0" width="25" height="2" rx="1" fill="currentColor" />
                    <rect x="0" y="6" width="25" height="2" rx="1" fill="currentColor" />
                </svg>
            </div>

            <div className="pointer-events-none relative flex h-full w-full items-center justify-center">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{overflow: 'visible'}}>
                    {[4, 3, 2, 1].map((multiplier) => (
                        <div
                            key={multiplier}
                            className="absolute rounded-full border-[3px]"
                            style={{
                                width: `${60 + multiplier * 20}px`,
                                height: `${60 + multiplier * 20}px`,
                                borderColor: recording.view.isRecording
                                    ? `rgba(239, 68, 68, ${0.7 - multiplier * 0.1})`
                                    : 'rgba(16, 185, 129, 0.5)',
                                opacity: recording.view.isRecording
                                    ? Math.max(0, recording.view.normalizedVolume - (multiplier - 1) * 0.15)
                                    : 0,
                                transform: `scale(${recording.view.isRecording ? 1 + recording.view.normalizedVolume * 0.4 : 0.8})`,
                                boxShadow: recording.view.isRecording
                                    ? `0 0 ${15 + recording.view.normalizedVolume * 30}px ${5 + recording.view.normalizedVolume * 15}px rgba(239, 68, 68, ${0.5 + recording.view.normalizedVolume * 0.3})`
                                    : 'none',
                                transition: 'opacity 0.12s ease, transform 0.12s ease'
                            }}
                        />
                    ))}
                </div>

                <div className="pointer-events-auto relative">
                    <MicrophoneButton
                        isRecording={recording.view.isRecording}
                        onToggle={recording.handlers.handleMicrophoneToggle}
                        disabled={recording.view.processing}
                        size={recording.view.isRecording ? 'compact' : 'default'}
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
                        {recording.view.displayedActions.map((action, index) => {
                            const total = recording.view.displayedActions.length;
                            const angleStep = total <= 2 ? 50 : total <= 4 ? 42 : 36;
                            const radius = total <= 2 ? 38 : total <= 4 ? 44 : 50;
                            const startAngle = 90;
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
                                        onClick={recording.handlers.handleActionClick}
                                        disabled={recording.view.processing && recording.view.activeActionId !== action.id}
                                        isActive={recording.view.activeActionId === action.id}
                                        isLoading={recording.view.processing && recording.view.activeActionId === action.id}
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

export default MicOverlay;
