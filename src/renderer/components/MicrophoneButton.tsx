import React, {useRef} from 'react';
import classNames from 'classnames';
import {interactiveEnter, interactiveLeave} from '../utils/interactive';

interface MicrophoneButtonProps {
    isRecording: boolean;
    onToggle: () => void;
    disabled?: boolean;
    size?: 'default' | 'compact';
}

const DRAG_THRESHOLD = 5; // пикселей для различения клика и перетаскивания

const sizeClasses: Record<NonNullable<MicrophoneButtonProps['size']>, string> = {
    default: 'h-20 w-20',
    compact: 'h-14 w-14'
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({isRecording, onToggle, disabled, size = 'default'}) => {
    const dragStateRef = useRef<{
        isDragging: boolean;
        startX: number;
        startY: number;
        lastScreenX: number;
        lastScreenY: number;
        windowStartX?: number;
        windowStartY?: number;
        pointerId: number;
        lastMoveTime: number;
    } | null>(null);

    const handleMouseEnter = () => {
        interactiveEnter();
    };

    const handleMouseLeave = () => {
        if (!dragStateRef.current?.isDragging) {
            interactiveLeave();
        }
    };

    const isNativeMovementSupported = typeof PointerEvent !== 'undefined' && 'movementX' in PointerEvent.prototype;

    const handlePointerDown = (e: React.PointerEvent) => {
        if (disabled) return;

        e.preventDefault();
        e.stopPropagation();

        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        const state = {
            isDragging: false,
            startX: e.screenX,
            startY: e.screenY,
            lastScreenX: e.screenX,
            lastScreenY: e.screenY,
            pointerId: e.pointerId,
            lastMoveTime: 0
        };

        dragStateRef.current = state;

        void window.winky?.mic?.setInteractive(true);

        void window.winky?.mic?.getPosition().then((pos) => {
            if (!dragStateRef.current || dragStateRef.current.pointerId !== state.pointerId) {
                return;
            }
            dragStateRef.current = {
                ...dragStateRef.current,
                windowStartX: pos.x,
                windowStartY: pos.y
            };
        }).catch(() => {
            // ignore, fallback to relative movement
        });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragStateRef.current || disabled) return;

        const dxTotal = e.screenX - dragStateRef.current.startX;
        const dyTotal = e.screenY - dragStateRef.current.startY;
        const distance = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal);

        // Если сдвинулись больше порога - начинаем перетаскивание
        if (distance > DRAG_THRESHOLD) {
            if (!dragStateRef.current.isDragging) {
                dragStateRef.current.isDragging = true;
            }

            // Throttle: максимум 60 FPS (16ms между обновлениями)
            const now = Date.now();
            if (now - dragStateRef.current.lastMoveTime < 16) {
                return;
            }
            dragStateRef.current.lastMoveTime = now;

            const deltaX = isNativeMovementSupported
                ? e.movementX || 0
                : e.screenX - dragStateRef.current.lastScreenX;
            const deltaY = isNativeMovementSupported
                ? e.movementY || 0
                : e.screenY - dragStateRef.current.lastScreenY;
            dragStateRef.current.lastScreenX = e.screenX;
            dragStateRef.current.lastScreenY = e.screenY;

            const windowStartX = dragStateRef.current.windowStartX;
            const windowStartY = dragStateRef.current.windowStartY;

            if (typeof windowStartX === 'number' && typeof windowStartY === 'number') {
                const newX = windowStartX + (e.screenX - dragStateRef.current.startX);
                const newY = windowStartY + (e.screenY - dragStateRef.current.startY);
                void window.winky?.mic?.moveWindow(newX, newY);
            } else if (deltaX !== 0 || deltaY !== 0) {
                void window.winky?.mic?.moveBy(deltaX, deltaY);
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!dragStateRef.current || disabled) return;

        const wasDragging = dragStateRef.current.isDragging;
        const pointerId = dragStateRef.current.pointerId;
        dragStateRef.current = null;

        const target = e.currentTarget as HTMLElement;
        if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
        }

        // После завершения перетаскивания проверяем, где мышь
        // Если за пределами кнопки, возвращаем click-through
        const rect = target.getBoundingClientRect();
        const isInside = e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!wasDragging) {
            onToggle();
        }

        if (!isInside) {
            interactiveLeave();
        }
    };

    const handlePointerCancel = (e: React.PointerEvent) => {
        if (!dragStateRef.current) return;

        const pointerId = dragStateRef.current.pointerId;
        dragStateRef.current = null;

        const target = e.currentTarget as HTMLElement;
        if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
        }
        interactiveLeave();
    };

    const handleLostPointerCapture = (e: React.PointerEvent) => {
        // Если потеряли захват указателя во время перетаскивания
        if (dragStateRef.current && dragStateRef.current.pointerId === e.pointerId) {
            dragStateRef.current = null;
            interactiveLeave();
        }
    };

    return (
        <button
            type="button"
            disabled={disabled}
            data-mic-button="true"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleMouseEnter}
            onBlur={handleMouseLeave}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
            className={classNames(
                'pointer-events-auto relative z-10 touch-none select-none',
                'flex items-center justify-center rounded-full text-3xl shadow-xl outline-none',
                sizeClasses[size],
                isRecording
                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                    : 'bg-white text-white',
                disabled && 'opacity-60',
                disabled && 'cursor-not-allowed'
            )}
            style={{
                transform: isRecording ? 'scale(0.7)' : 'scale(1)',
                transition: 'transform 0.3s ease-in-out, background-color 0.3s ease-in-out'
            }}
        >
            {/* Иконка микрофона */}
            <svg 
                viewBox="0 0 24 24" 
                className={classNames(
                    'absolute h-10 w-10 fill-current pointer-events-none text-black transition-opacity duration-300',
                    isRecording ? 'opacity-0' : 'opacity-100'
                )}
            >
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/>
                <path
                    d="M19 12a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 12z"/>
            </svg>
            
            {/* Иконка квадратика (стоп) */}
            <svg 
                viewBox="0 0 24 24" 
                className={classNames(
                    'absolute h-10 w-10 fill-current pointer-events-none transition-opacity duration-300',
                    isRecording ? 'opacity-100' : 'opacity-0'
                )}
            >
                <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
        </button>
    );
};

export default MicrophoneButton;
