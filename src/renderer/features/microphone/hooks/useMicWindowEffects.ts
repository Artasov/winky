import {useEffect} from 'react';

type MicWindowEffectsParams = {
    isMicOverlay: boolean;
    autoStartPendingRef: React.MutableRefObject<boolean>;
    isRecordingRef: React.MutableRefObject<boolean>;
    processingRef: React.MutableRefObject<boolean>;
    handleMicrophoneToggleRef: React.MutableRefObject<(() => Promise<void> | void) | null>;
    finishRecording: (resetUI?: boolean) => Promise<Blob | null>;
    setActiveActionId: (value: string | null) => void;
};

export const useMicWindowEffects = ({
    isMicOverlay,
    autoStartPendingRef,
    isRecordingRef,
    processingRef,
    handleMicrophoneToggleRef,
    finishRecording,
    setActiveActionId
}: MicWindowEffectsParams) => {
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
                autoStartPendingRef.current = false;
                if (isRecordingRef.current) {
                    (async () => {
                        try {
                            await finishRecording();
                        } finally {
                            setActiveActionId(null);
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
    }, [isMicOverlay, autoStartPendingRef, isRecordingRef, processingRef, handleMicrophoneToggleRef, finishRecording, setActiveActionId]);

    useEffect(() => {
        if (!isMicOverlay) {
            return;
        }
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
    }, [isMicOverlay]);
};
