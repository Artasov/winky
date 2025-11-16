import {useEffect, useRef} from 'react';
import {requestTransientInteractive, resetInteractive} from '../../../utils/interactive';

type MicWindowEffectsParams = {
    isMicOverlay: boolean;
    autoStartPendingRef: React.MutableRefObject<boolean>;
    isRecordingRef: React.MutableRefObject<boolean>;
    processingRef: React.MutableRefObject<boolean>;
    handleMicrophoneToggleRef: React.MutableRefObject<(() => Promise<void> | void) | null>;
    finishRecording: (resetUI?: boolean) => Promise<Blob | null>;
    setActiveActionId: (value: string | null) => void;
    warmUpRecorder: () => Promise<void>;
};

export const useMicWindowEffects = ({
    isMicOverlay,
    autoStartPendingRef,
    isRecordingRef,
    processingRef,
    handleMicrophoneToggleRef,
    finishRecording,
    setActiveActionId,
    warmUpRecorder
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
            requestTransientInteractive();
            autoStartPendingRef.current = true;
            attemptAutoStart();
        };

        const visibilityHandler = (first?: { visible?: boolean } | unknown, second?: { visible?: boolean }) => {
            const data = (first && typeof (first as any)?.visible === 'boolean')
                ? (first as { visible?: boolean })
                : second;
            if (data?.visible) {
                requestTransientInteractive();
                void warmUpRecorder();
                return;
            }
            clearAutoStartRetry();
            autoStartPendingRef.current = false;
            resetInteractive();
            if (isRecordingRef.current) {
                (async () => {
                    try {
                        await finishRecording();
                    } finally {
                        setActiveActionId(null);
                    }
                })();
            }
        };

        const prepareHandler = () => {
            void warmUpRecorder();
        };

        api.on('mic:prepare-recording', prepareHandler);
        api.on('mic:start-recording', startHandler);
        api.on('mic:visibility-change', visibilityHandler);
        return () => {
            clearAutoStartRetry();
            api.removeListener?.('mic:prepare-recording', prepareHandler);
            api.removeListener?.('mic:start-recording', startHandler);
            api.removeListener?.('mic:visibility-change', visibilityHandler);
        };
    }, [isMicOverlay, autoStartPendingRef, isRecordingRef, processingRef, handleMicrophoneToggleRef, finishRecording, setActiveActionId, warmUpRecorder]);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }

        const api = window.winky;
        if (!api?.on) {
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

        api.on('mic:start-fade-in', handleFadeIn);
        api.on('mic:start-fade-out', handleFadeOut);

        return () => {
            api.removeListener?.('mic:start-fade-in', handleFadeIn);
            api.removeListener?.('mic:start-fade-out', handleFadeOut);
        };
    }, [isMicOverlay]);
};
