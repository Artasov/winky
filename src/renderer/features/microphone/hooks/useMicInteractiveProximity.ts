import {useEffect} from 'react';
import type {RefObject} from 'react';
import {setProximityInteractive} from '../../../utils/interactive';

type MicInteractiveProximityParams = {
    isMicOverlay: boolean;
    micButtonRef: RefObject<HTMLElement>;
    actionsContainerRef: RefObject<HTMLElement>;
    actionsEnabled: boolean;
};

const isPointInsideRect = (
    cursor: {x: number; y: number},
    rect: DOMRect,
    padding: number,
    windowOffset: {x: number; y: number}
) => {
    const left = windowOffset.x + rect.left - padding;
    const right = windowOffset.x + rect.right + padding;
    const top = windowOffset.y + rect.top - padding;
    const bottom = windowOffset.y + rect.bottom + padding;
    return cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom;
};

export const useMicInteractiveProximity = ({
    isMicOverlay,
    micButtonRef,
    actionsContainerRef,
    actionsEnabled
}: MicInteractiveProximityParams) => {
    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            setProximityInteractive(false);
            return;
        }

        let cancelled = false;
        let timeoutId: number | null = null;
        let proximityActive = false;

        const schedule = (delay = 60) => {
            if (cancelled) {
                return;
            }
            timeoutId = window.setTimeout(checkProximity, delay);
        };

        const checkProximity = async () => {
            if (cancelled) {
                return;
            }
            try {
                const micApi = window.winky?.mic;
                if (!micApi?.getCursorPosition) {
                    schedule(250);
                    return;
                }
                const cursor = await micApi.getCursorPosition();
                const windowOffset = {
                    x: window.screenX || 0,
                    y: window.screenY || 0
                };
                const buttonRect = micButtonRef.current?.getBoundingClientRect() ?? null;
                const actionRects: DOMRect[] = [];
                if (actionsEnabled && actionsContainerRef.current) {
                    const elements = actionsContainerRef.current.querySelectorAll<HTMLElement>('.action-btn-container');
                    elements.forEach((el) => {
                        const rect = el.getBoundingClientRect();
                        actionRects.push(rect);
                    });
                }

                let inside = false;
                if (buttonRect) {
                    inside = isPointInsideRect(cursor, buttonRect, 10, windowOffset);
                }
                if (!inside) {
                    for (const rect of actionRects) {
                        if (isPointInsideRect(cursor, rect, 12, windowOffset)) {
                            inside = true;
                            break;
                        }
                    }
                }

                if (inside && !proximityActive) {
                    proximityActive = true;
                    setProximityInteractive(true);
                } else if (!inside && proximityActive) {
                    proximityActive = false;
                    setProximityInteractive(false);
                }
                schedule(inside ? 30 : 80);
            } catch {
                schedule(120);
            }
        };

        schedule(60);

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            if (proximityActive) {
                setProximityInteractive(false);
            }
        };
    }, [isMicOverlay, micButtonRef, actionsContainerRef, actionsEnabled]);
};
