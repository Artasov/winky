import {useEffect} from 'react';

type MutableRef<T> = {current: T};

type UseMicVisibilityMonitorParams = {
    isMicOverlay: boolean;
    isRecordingRef: MutableRef<boolean>;
    currentStreamRef: MutableRef<MediaStream | null>;
    windowVisibleRef: MutableRef<boolean>;
    startVolumeMonitor: (stream: MediaStream) => void;
    stopVolumeMonitor: () => void;
};

export const useMicVisibilityMonitor = ({
    isMicOverlay,
    isRecordingRef,
    currentStreamRef,
    windowVisibleRef,
    startVolumeMonitor,
    stopVolumeMonitor
}: UseMicVisibilityMonitorParams): void => {
    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const api = window.winky;
        if (!api?.on) {
            return;
        }
        const handleVisibilityChange = (
            first?: {visible?: boolean} | unknown,
            second?: {visible?: boolean}
        ) => {
            const payload = (first && typeof (first as any)?.visible === 'boolean')
                ? (first as {visible?: boolean})
                : second;
            const isVisible = payload?.visible === true;
            windowVisibleRef.current = isVisible;
            if (!isVisible) {
                stopVolumeMonitor();
            } else if (isRecordingRef.current && currentStreamRef.current) {
                startVolumeMonitor(currentStreamRef.current);
            }
        };

        const handleDocumentVisibilityChange = () => {
            const isVisible = typeof document !== 'undefined' ? !document.hidden : true;
            windowVisibleRef.current = isVisible;
            if (!isVisible) {
                stopVolumeMonitor();
            } else if (isRecordingRef.current && currentStreamRef.current) {
                startVolumeMonitor(currentStreamRef.current);
            }
        };

        api.on('mic:visibility-change', handleVisibilityChange);
        document.addEventListener('visibilitychange', handleDocumentVisibilityChange);

        if (typeof document !== 'undefined' && document.hidden) {
            windowVisibleRef.current = false;
            stopVolumeMonitor();
        }

        return () => {
            api.removeListener?.('mic:visibility-change', handleVisibilityChange);
            document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
        };
    }, [isMicOverlay, startVolumeMonitor, stopVolumeMonitor, isRecordingRef, currentStreamRef, windowVisibleRef]);
};
