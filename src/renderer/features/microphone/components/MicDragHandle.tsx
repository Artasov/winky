import React from 'react';
import type {MicOverlayInteractions} from '../hooks/useMicOverlayInteractions';

interface MicDragHandleProps {
    interactions: MicOverlayInteractions;
    isRecording: boolean;
    disabled: boolean;
}

const MicDragHandleComponent: React.FC<MicDragHandleProps> = ({interactions, isRecording, disabled}) => {
    const style: React.CSSProperties = {
        pointerEvents: disabled ? 'none' : 'auto',
        top: isRecording ? 'calc(50% - 35px)' : 'calc(50% - 56px)',
        opacity: isRecording ? 1 : 0.92,
        transition: 'top 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease'
    };

    const handleMouseEnter = () => {
        console.log('[mic-drag] mouse enter handle');
        interactions.handleHandleMouseEnter();
    };

    const handleMouseLeave = () => {
        console.log('[mic-drag] mouse leave handle');
        interactions.handleHandleMouseLeave();
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        console.log('[mic-drag] pointer down', {pointerType: event.pointerType, button: event.button});
        interactions.handleHandlePointerDown(event);
    };

    return (
        <div
            className="absolute left-1/2 -translate-x-1/2 z-50 cursor-move select-none app-region-drag flex items-center justify-center"
            style={style}
            ref={interactions.dragHandleRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onPointerDown={handlePointerDown}
            role="presentation"
            aria-hidden="true"
        >
            <svg
                width={30}
                height={10}
                viewBox="0 0 25 10"
                className="pointer-events-none text-white/55 drop-shadow-[0_0_4px_rgba(0,0,0,0.35)]"
            >
                <rect x="0" y="0" width="25" height="2" rx="1" fill="currentColor"/>
                <rect x="0" y="6" width="25" height="2" rx="1" fill="currentColor"/>
            </svg>
        </div>
    );
};

const MicDragHandle = React.memo(MicDragHandleComponent);

export default MicDragHandle;
