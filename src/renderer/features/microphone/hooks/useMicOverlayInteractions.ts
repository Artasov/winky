import {useCallback, useEffect, useRef, useState} from 'react';
import {interactiveEnter, interactiveLeave, setDragInteractive} from '../../../utils/interactive';

type UseMicOverlayInteractionsParams = {
    isMicOverlay: boolean;
};

export const useMicOverlayInteractions = ({isMicOverlay}: UseMicOverlayInteractionsParams) => {
    const dragPointerIdRef = useRef<number | null>(null);
    const dragPointerCleanupRef = useRef<(() => void) | null>(null);
    const suppressedHandleLeaveRef = useRef(false);
    const dragHandleRef = useRef<HTMLDivElement | null>(null);
    const handleHoveringRef = useRef(false);
    const windowVisibleRef = useRef(true);
    const [dragging, setDragging] = useState(false);
    const dragResetTimeoutRef = useRef<number | null>(null);
    const handleHandleMouseEnter = useCallback(() => {
        if (handleHoveringRef.current) {
            return;
        }
        handleHoveringRef.current = true;
        if (suppressedHandleLeaveRef.current) {
            suppressedHandleLeaveRef.current = false;
            return;
        }
        console.log('[mic-overlay] handle hover enter');
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
        console.log('[mic-overlay] handle hover leave');
        interactiveLeave();
    }, []);

    const handleHandlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        console.log('[mic-overlay] pointer down', {pointerType: event.pointerType, button: event.button});
        dragPointerCleanupRef.current?.();

        const pointerId = event.pointerId;
        dragPointerIdRef.current = pointerId;
        
        // КРИТИЧНО: Устанавливаем состояние перетаскивания и интерактивности ПЕРЕД началом перетаскивания
        // Это особенно важно при автоматическом старте записи, когда окно может быть еще не готово
        // Устанавливаем dragActive ПЕРВЫМ - это вызовет applyState() и сделает окно интерактивным
        setDragInteractive(true);
        interactiveEnter();
        handleHandleMouseEnter();
        setDragging(true);

        const micApi = window.winky?.mic;

        function handlePointerEnd(pointerEvent: PointerEvent) {
            if (pointerEvent.pointerId !== pointerId) {
                return;
            }
            console.log('[mic-overlay] pointer end', {pointerId});
            cleanupPointerListeners();
        }

        function cleanupPointerListeners() {
            console.log('[mic-overlay] cleanup pointer listeners');
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
            setDragInteractive(false);
            if (dragResetTimeoutRef.current !== null) {
                window.clearTimeout(dragResetTimeoutRef.current);
            }
            dragResetTimeoutRef.current = window.setTimeout(() => {
                setDragging(false);
                dragResetTimeoutRef.current = null;
            }, 80);
        }

        dragPointerCleanupRef.current = cleanupPointerListeners;

        window.addEventListener('pointerup', handlePointerEnd, true);
        window.addEventListener('pointercancel', handlePointerEnd, true);

        // Используем requestAnimationFrame для гарантии, что окно стало интерактивным перед beginDrag
        // Это особенно важно при автоматическом старте записи
        requestAnimationFrame(() => {
            if (dragPointerIdRef.current !== pointerId || !micApi?.beginDrag) {
                return;
            }
            // Вызываем beginDrag для нативного перетаскивания окна
            void micApi.beginDrag();
        });
    }, [handleHandleMouseEnter]);

    useEffect(() => () => {
        console.log('[mic-overlay] effect cleanup');
        dragPointerCleanupRef.current?.();
        if (dragResetTimeoutRef.current !== null) {
            window.clearTimeout(dragResetTimeoutRef.current);
            dragResetTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            return;
        }
        const api = window.winky;
        if (!api?.on) {
            return;
        }
        const handleVisibilityChange = (
            first?: { visible?: boolean } | unknown,
            second?: { visible?: boolean }
        ) => {
            const payload = (first && typeof (first as any)?.visible === 'boolean')
                ? (first as { visible?: boolean })
                : second;
            if (payload?.visible) {
                windowVisibleRef.current = true;
                console.log('[mic-overlay] window visible');
                return;
            }
            windowVisibleRef.current = false;
            console.log('[mic-overlay] window hidden');
            dragPointerCleanupRef.current?.();
            handleHoveringRef.current = false;
            suppressedHandleLeaveRef.current = false;
            interactiveLeave();
            setDragging(false);
            if (dragResetTimeoutRef.current !== null) {
                window.clearTimeout(dragResetTimeoutRef.current);
                dragResetTimeoutRef.current = null;
            }
        };
        api.on('mic:visibility-change', handleVisibilityChange);
        return () => {
            api.removeListener?.('mic:visibility-change', handleVisibilityChange);
            if (dragResetTimeoutRef.current !== null) {
                window.clearTimeout(dragResetTimeoutRef.current);
                dragResetTimeoutRef.current = null;
            }
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
            if (!windowVisibleRef.current) {
                timeoutId = setTimeout(pollCursor, 350);
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
                    console.log('[mic-overlay] cursor near handle', {cursor});
                    handleHandleMouseEnter();
                } else if (handleHoveringRef.current && dragPointerIdRef.current === null) {
                    console.log('[mic-overlay] cursor left handle', {cursor});
                    handleHandleMouseLeave();
                }
            } catch {
                // ignore polling errors
            } finally {
                timeoutId = setTimeout(pollCursor, 60);
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
        dragging,
        handleHandleMouseEnter,
        handleHandleMouseLeave,
        handleHandlePointerDown,
        dragPointerIdRef
    };
};

export type MicOverlayInteractions = ReturnType<typeof useMicOverlayInteractions>;
