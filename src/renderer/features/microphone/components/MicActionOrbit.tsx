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

    const positions = useMemo(() => {
        const total = actions.length;
        if (total === 0) {
            return [];
        }

        if (total === 1) {
            return [{action: actions[0], offsetX: 0, offsetY: 56}];
        }

        const radius = 44;
        const maxSpanPerSide = 110;
        const stepDegrees = 36;
        const totalSpan = Math.min(maxSpanPerSide, stepDegrees * (total - 1));
        const startAngle = 90 - totalSpan;
        const endAngle = 90 + totalSpan;
        const step = total > 1 ? (endAngle - startAngle) / (total - 1) : 0;

        return actions.map((action, index) => {
            const angleDeg = startAngle + index * step;
            const angleRad = (angleDeg * Math.PI) / 180;
            const offsetX = Math.cos(angleRad) * radius;
            const offsetY = Math.sin(angleRad) * radius;
            return {action, offsetX, offsetY};
        });
    }, [actions]);

    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
                className="pointer-events-none absolute rounded-full bg-rose-500/20 blur-md"
                style={{width: '64px', height: '64px', ...actionsAuraStyle}}
            />
            <div className="absolute left-1/2 top-1/2" style={actionsWrapperStyle}>
                {positions.map(({action, offsetX, offsetY}) => (
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
                ))}
            </div>
        </div>
    );
};

const MicActionOrbit = React.memo(MicActionOrbitComponent);

export default MicActionOrbit;
