import {useEffect, useRef} from 'react';

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
    const autoStartRetryTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }

        const api = window.winky;
        if (!api?.on) {
            return;
        }

        const clearAutoStartRetry = () => {
            if (autoStartRetryTimeoutRef.current !== null) {
                window.clearTimeout(autoStartRetryTimeoutRef.current);
                autoStartRetryTimeoutRef.current = null;
            }
        };

        const attemptAutoStart = () => {
            const toggle = handleMicrophoneToggleRef.current;
            if (!toggle) {
                autoStartRetryTimeoutRef.current = window.setTimeout(attemptAutoStart, 50);
                return;
            }
            Promise.resolve(toggle()).finally(() => {
                autoStartPendingRef.current = false;
                clearAutoStartRetry();
            });
        };

        const startHandler = () => {
            if (autoStartPendingRef.current || isRecordingRef.current || processingRef.current) {
                return;
            }
            autoStartPendingRef.current = true;
            attemptAutoStart();
        };

        const visibilityHandler = (_event: unknown, payload: { visible: boolean }) => {
            if (!payload?.visible) {
                clearAutoStartRetry();
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
            clearAutoStartRetry();
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
