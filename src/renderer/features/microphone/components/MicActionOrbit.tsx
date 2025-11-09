import React, {useMemo} from 'react';
import type {ActionConfig} from '@shared/types';
import ActionButton from '../../../components/ActionButton';

interface MicActionOrbitProps {
    actions: ActionConfig[];
    actionsVisible: boolean;
    processing: boolean;
    activeActionId: string | null;
    onActionClick: (action: ActionConfig) => Promise<void> | void;
}

const MicActionOrbitComponent: React.FC<MicActionOrbitProps> = ({
    actions,
    actionsVisible,
    processing,
    activeActionId,
    onActionClick
}) => {
    const actionsWrapperStyle = useMemo<React.CSSProperties>(() => ({
        width: 0,
        height: 0,
        opacity: actionsVisible ? 1 : 0,
        pointerEvents: processing ? 'none' : (actionsVisible ? 'auto' : 'none'),
        transform: `translate(-50%, -50%) scale(${actionsVisible ? 1 : 0.85})`,
        transition: 'opacity 220ms ease, transform 240ms ease'
    }), [actionsVisible, processing]);

    const actionsAuraStyle = useMemo<React.CSSProperties>(() => ({
        opacity: actionsVisible ? 1 : 0,
        transform: `scale(${actionsVisible ? 1 : 0.85})`,
        transition: 'opacity 220ms ease, transform 240ms ease'
    }), [actionsVisible]);

    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
                className="pointer-events-none absolute rounded-full bg-rose-500/20 blur-md"
                style={{width: '64px', height: '64px', ...actionsAuraStyle}}
            />
            <div className="absolute left-1/2 top-1/2" style={actionsWrapperStyle}>
                {actions.map((action, index) => {
                    const total = actions.length;
                    const angleStep = total <= 2 ? 50 : total <= 4 ? 42 : 36;
                    const radius = total <= 2 ? 38 : total <= 4 ? 44 : 50;
                    const startAngle = 90;
                    const angleDeg = startAngle - angleStep * index;
                    const angleRad = (angleDeg * Math.PI) / 180;
                    const offsetX = Math.cos(angleRad) * radius;
                    const offsetY = Math.sin(angleRad) * radius;
                    return (
                        <div
                            key={action.id}
                            className="action-btn-container pointer-events-auto absolute transition-transform duration-200"
                            style={{
                                left: 0,
                                top: 0,
                                transform: `translate(${offsetX}px, ${offsetY}px) translate(-50%, -50%)`
                            }}
                        >
                            <ActionButton
                                action={action}
                                onClick={onActionClick}
                                disabled={processing && activeActionId !== action.id}
                                isActive={activeActionId === action.id}
                                isLoading={processing && activeActionId === action.id}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const MicActionOrbit = React.memo(MicActionOrbitComponent);

export default MicActionOrbit;
