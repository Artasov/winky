import {useCallback, useEffect, useRef} from 'react';
import {interactiveEnter, interactiveLeave} from '../../../utils/interactive';

type UseMicOverlayInteractionsParams = {
    isMicOverlay: boolean;
};

export const useMicOverlayInteractions = ({isMicOverlay}: UseMicOverlayInteractionsParams) => {
    const dragPointerIdRef = useRef<number | null>(null);
    const dragPointerCleanupRef = useRef<(() => void) | null>(null);
    const suppressedHandleLeaveRef = useRef(false);
    const dragHandleRef = useRef<HTMLDivElement | null>(null);
    const handleHoveringRef = useRef(false);

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

    useEffect(() => () => {
        dragPointerCleanupRef.current?.();
    }, []);

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

    return {
        dragHandleRef,
        handleHandleMouseEnter,
        handleHandleMouseLeave,
        handleHandlePointerDown,
        dragPointerIdRef
    };
};

export type MicOverlayInteractions = ReturnType<typeof useMicOverlayInteractions>;
