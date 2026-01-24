import React, {useCallback, useMemo} from 'react';
import {Box} from '@mui/material';
import type {ActionGroup} from '@shared/types';
import {getMediaUrl, SYSTEM_GROUP_ID} from '@shared/constants';
import {interactiveEnter, interactiveLeave} from '../../../utils/interactive';

type Props = {
    groups: ActionGroup[];
    selectedGroupId: string | null;
    onSelectGroup: (groupId: string) => void;
    disabled?: boolean;
    containerRef?: React.RefObject<HTMLDivElement | null>;
};

const MicGroupSelector: React.FC<Props> = ({
    groups,
    selectedGroupId,
    onSelectGroup,
    disabled = false,
    containerRef
}) => {
    const sortedGroups = useMemo(() => {
        return [...groups]
            .filter((g) => !g.is_system && g.id !== SYSTEM_GROUP_ID)
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    }, [groups]);

    const handleClick = useCallback((groupId: string) => {
        if (disabled) return;
        onSelectGroup(groupId);
    }, [disabled, onSelectGroup]);

    if (sortedGroups.length === 0) {
        return null;
    }

    return (
        <div
            ref={containerRef}
            className="fr gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{
                pointerEvents: disabled ? 'none' : 'auto',
                opacity: disabled ? 0.5 : 1,
                transition: 'opacity 200ms ease',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(8px)'
            }}
            onMouseEnter={() => interactiveEnter()}
            onMouseLeave={() => interactiveLeave()}
            data-interactive="true"
        >
            {sortedGroups.map((group) => {
                const isSelected = group.id === selectedGroupId;
                return (
                    <button
                        key={group.id}
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClick(group.id);
                        }}
                        disabled={disabled}
                        title={group.name}
                        className="frcc rounded-full transition-all duration-200"
                        style={{
                            width: 32,
                            height: 32,
                            minWidth: 32,
                            border: `2px solid ${isSelected ? group.color : 'transparent'}`,
                            backgroundColor: isSelected ? `${group.color}30` : 'transparent',
                            cursor: disabled ? 'default' : 'pointer',
                            pointerEvents: 'auto'
                        }}
                    >
                        {group.icon_details?.svg ? (
                            <Box
                                component="img"
                                src={getMediaUrl(group.icon_details.svg)}
                                alt={group.name}
                                sx={{
                                    width: 18,
                                    height: 18,
                                    opacity: isSelected ? 1 : 0.6,
                                    transition: 'opacity 200ms ease',
                                    filter: 'brightness(0) invert(1)'
                                }}
                            />
                        ) : (
                            <Box
                                sx={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    bgcolor: 'rgba(255, 255, 255, 0.8)'
                                }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default MicGroupSelector;
