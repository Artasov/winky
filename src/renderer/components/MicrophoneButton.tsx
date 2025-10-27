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
        windowStartX: number;
        windowStartY: number;
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

    const handlePointerDown = (e: React.PointerEvent) => {
        if (disabled) return;

        interactiveEnter();

        e.preventDefault();
        e.stopPropagation();

        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        // Запоминаем начальную позицию
        dragStateRef.current = {
            isDragging: false,
            startX: e.screenX,
            startY: e.screenY,
            windowStartX: window.screenX,
            windowStartY: window.screenY,
            pointerId: e.pointerId,
            lastMoveTime: 0
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragStateRef.current || disabled) return;

        const dx = e.screenX - dragStateRef.current.startX;
        const dy = e.screenY - dragStateRef.current.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

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

            const newX = dragStateRef.current.windowStartX + dx;
            const newY = dragStateRef.current.windowStartY + dy;

            // Не ждем ответа от IPC - fire and forget для плавности
            void window.winky?.mic?.moveWindow(newX, newY);
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
        if (!isInside) {
            interactiveLeave();
        }

        // Если не было перетаскивания - это клик
        if (!wasDragging) {
            onToggle();
        }

        interactiveLeave();
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
                'flex items-center justify-center rounded-full text-3xl shadow-xl transition-transform outline-none',
                sizeClasses[size],
                isRecording
                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                    : 'bg-white text-white',
                disabled && 'opacity-60',
                isRecording ? 'scale-95' : 'scale-95',
                disabled && 'cursor-not-allowed'
            )}
        >
            {isRecording ? (
                <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current pointer-events-none">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current pointer-events-none text-black">
                    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/>
                    <path
                        d="M19 12a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 12z"/>
                </svg>
            )}
        </button>
    );
};

export default MicrophoneButton;
