import React, { useEffect, useRef } from 'react';
import classNames from 'classnames';
import { acquireInteractivity, releaseInteractivity } from '../utils/windowInteractivity';

interface MicrophoneButtonProps {
  isRecording: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'default' | 'compact';
}

const sizeClasses: Record<NonNullable<MicrophoneButtonProps['size']>, string> = {
  default: 'h-24 w-24',
  compact: 'h-16 w-16'
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ isRecording, onToggle, disabled, size = 'default' }) => {
  const pointerDownRef = useRef(false);
  const pointerMovedRef = useRef(false);
  const initialPointRef = useRef({ x: 0, y: 0 });
  const insideRef = useRef(false);
  const dragStartedRef = useRef(false);
  const lastPointerScreenRef = useRef({ x: 0, y: 0 });
  useEffect(() => () => {
    releaseInteractivity(0);
  }, []);

  const handlePointerEnter = () => {
    insideRef.current = true;
    acquireInteractivity();
  };

  const handlePointerLeave = () => {
    insideRef.current = false;
    if (!pointerDownRef.current) {
      releaseInteractivity();
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    acquireInteractivity();
    pointerDownRef.current = true;
    pointerMovedRef.current = false;
    dragStartedRef.current = false;
    initialPointRef.current = { x: event.clientX, y: event.clientY };
    lastPointerScreenRef.current = { x: event.screenX, y: event.screenY };
    window.winky?.windowControls
      ?.startDrag({ x: event.screenX, y: event.screenY })
      .then((started) => {
        dragStartedRef.current = Boolean(started);
        if (!started) {
          releaseInteractivity(150);
        } else {
          window.winky?.windowControls?.updateDrag(lastPointerScreenRef.current);
        }
      })
      .catch((error) => {
        console.error('[MicrophoneButton] Не удалось начать перетаскивание окна', error);
        dragStartedRef.current = false;
        releaseInteractivity(150);
      });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerDownRef.current) {
      return;
    }

    const dx = event.clientX - initialPointRef.current.x;
    const dy = event.clientY - initialPointRef.current.y;
    if (!pointerMovedRef.current && Math.sqrt(dx * dx + dy * dy) > 4) {
      pointerMovedRef.current = true;
    }

    lastPointerScreenRef.current = { x: event.screenX, y: event.screenY };

    if (dragStartedRef.current) {
      window.winky?.windowControls?.updateDrag({ x: event.screenX, y: event.screenY });
    }
  };

  const finalizePointer = (shouldToggle: boolean) => {
    pointerDownRef.current = false;

    if (dragStartedRef.current) {
      window.winky?.windowControls
        ?.endDrag()
        .catch((error) => console.error('[MicrophoneButton] Не удалось завершить перетаскивание окна', error));
      dragStartedRef.current = false;
    }

    if (shouldToggle && !disabled) {
      onToggle();
    }

    releaseInteractivity(0);
    if (!insideRef.current) {
      releaseInteractivity(0);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerDownRef.current) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const shouldToggle = !pointerMovedRef.current;
    pointerMovedRef.current = false;
    finalizePointer(shouldToggle);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerDownRef.current) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    pointerMovedRef.current = false;
    finalizePointer(false);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={classNames(
        'flex items-center justify-center rounded-full text-3xl shadow-xl transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2',
        sizeClasses[size],
        isRecording
          ? 'bg-rose-600 text-white hover:bg-rose-500 focus:ring-rose-300'
          : 'bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-300',
        disabled && 'opacity-60 cursor-not-allowed',
        isRecording ? 'scale-95' : 'scale-100'
      )}
    >
      {isRecording ? (
        <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
          <path d="M19 12a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.07A7 7 0 0 0 19 12z" />
        </svg>
      )}
    </button>
  );
};

export default MicrophoneButton;
