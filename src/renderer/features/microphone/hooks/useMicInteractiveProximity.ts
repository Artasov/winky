import {useEffect} from 'react';
import type {RefObject} from 'react';
import {setProximityInteractive} from '../../../utils/interactive';

type MicInteractiveProximityParams = {
    isMicOverlay: boolean;
    micButtonRef: RefObject<HTMLDivElement | null>;
    actionsContainerRef: RefObject<HTMLDivElement | null>;
    actionsEnabled: boolean;
    contextFieldRef?: RefObject<HTMLDivElement | null>;
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
    actionsEnabled,
    contextFieldRef
}: MicInteractiveProximityParams) => {
    useEffect(() => {
        if (!isMicOverlay || typeof window === 'undefined') {
            setProximityInteractive(false);
            return;
        }

        let cancelled = false;
        let timeoutId: number | null = null;
        let proximityActive = false;
        let lingerUntil = 0;
        const lingerMs = 450;

        const schedule = (delay = 140) => {
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
                const contextRect = contextFieldRef?.current?.getBoundingClientRect() ?? null;
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
                if (!inside && contextRect) {
                    inside = isPointInsideRect(cursor, contextRect, 12, windowOffset);
                }

                const windowWidth = typeof window.innerWidth === 'number' ? window.innerWidth : 0;
                const windowHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 0;
                const nearMargin = 90;
                const nearWindow = cursor.x >= windowOffset.x - nearMargin
                    && cursor.x <= windowOffset.x + windowWidth + nearMargin
                    && cursor.y >= windowOffset.y - nearMargin
                    && cursor.y <= windowOffset.y + windowHeight + nearMargin;

                const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                if (inside) {
                    lingerUntil = now + lingerMs;
                    if (!proximityActive) {
                        proximityActive = true;
                        setProximityInteractive(true);
                    }
                } else if (proximityActive && now > lingerUntil) {
                    proximityActive = false;
                    setProximityInteractive(false);
                }
                schedule(inside ? 60 : (nearWindow ? 120 : 260));
            } catch {
                schedule(320);
            }
        };

        schedule(120);

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            if (proximityActive) {
                setProximityInteractive(false);
            }
        };
    }, [isMicOverlay, micButtonRef, actionsContainerRef, actionsEnabled, contextFieldRef]);
};
