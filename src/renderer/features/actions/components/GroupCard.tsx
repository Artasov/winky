import React from 'react';
import {Box, Chip, IconButton, Typography} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StarsRoundedIcon from '@mui/icons-material/StarsRounded';
import type {ActionConfig, ActionGroup} from '@shared/types';
import {getMediaUrl, MAX_ACTIONS_PER_GROUP, SYSTEM_GROUP_ID} from '@shared/constants';
import ActionCard from './ActionCard';

type Props = {
    group: ActionGroup;
    deletingActionIds: Set<string>;
    isDeleting: boolean;
    onEditGroup: (group: ActionGroup) => void;
    onDeleteGroup: (id: string, name: string) => void;
    onEditAction: (action: ActionConfig) => void;
    onDeleteAction: (id: string, name: string) => void;
    showPrompts?: boolean;
};

const GroupCard: React.FC<Props> = ({
    group,
    deletingActionIds,
    isDeleting,
    onEditGroup,
    onDeleteGroup,
    onEditAction,
    onDeleteAction,
    showPrompts = false
}) => {
    const isSystemGroup = group.is_system || group.id === SYSTEM_GROUP_ID;
    const groupColor = isSystemGroup ? '#6366f1' : (group.color || '#f43f5e');

    return (
        <Box
            className={'winky-group-card'}
            sx={{
                width: '100%',
                borderRadius: 3,
                border: '2px solid',
                borderColor: groupColor + '40',
                background: '#fff',
                overflow: 'hidden',
                transition: 'border-color 260ms ease, box-shadow 260ms ease',
                '&:hover': {
                    borderColor: groupColor + '80',
                    boxShadow: `0 8px 32px ${groupColor}15`
                },
                '&:hover .group-card__actions': {
                    opacity: 1,
                    pointerEvents: 'auto',
                    transform: 'translateX(0)'
                }
            }}
        >
            {/* Group Header */}
            <Box
                className={'frsc gap-3'}
                sx={{
                    px: 1.5,
                    pt: 1.4,
                    pb: 1.2,
                    background: `linear-gradient(135deg, ${groupColor}08, ${groupColor}15)`,
                    borderBottom: '1px solid',
                    borderColor: groupColor + '20',
                }}
            >
                <Box
                    sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 2,
                        background: `linear-gradient(135deg, ${groupColor}20, ${groupColor}30)`,
                        border: `1px solid ${groupColor}30`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}
                >
                    {isSystemGroup ? (
                        <StarsRoundedIcon sx={{fontSize: 26, color: groupColor}}/>
                    ) : group.icon_details?.svg ? (
                        <Box
                            component="img"
                            src={getMediaUrl(group.icon_details.svg)}
                            alt={group.icon_details.name || ''}
                            sx={{width: 26, height: 26}}
                        />
                    ) : (
                        <Typography variant="h5">📁</Typography>
                    )}
                </Box>

                <div className={'fc mr-auto'}>
                    <Typography variant="subtitle1" lineHeight={'1rem'} fontWeight={600} noWrap>
                        {group.name}
                    </Typography>
                    {group.description && (
                        <Typography variant="caption" lineHeight={'1rem'} color="text.secondary" noWrap>
                            {group.description}
                        </Typography>
                    )}
                </div>

                {!isSystemGroup && (
                    <>
                        {/* Edit/Delete buttons - appear on hover */}
                        <Box
                            className="group-card__actions"
                            sx={{
                                display: 'flex',
                                gap: 0.5,
                                opacity: 0,
                                pointerEvents: 'none',
                                transform: 'translateX(8px)',
                                transition: 'opacity 260ms ease, transform 260ms ease'
                            }}
                        >
                            <IconButton
                                size="small"
                                onClick={() => onEditGroup(group)}
                                sx={{
                                    bgcolor: 'rgba(0,0,0,0.04)',
                                    '&:hover': {bgcolor: 'rgba(0,0,0,0.08)'}
                                }}
                            >
                                <EditOutlinedIcon fontSize="small"/>
                            </IconButton>
                            <IconButton
                                size="small"
                                color="error"
                                disabled={isDeleting}
                                onClick={() => onDeleteGroup(group.id, group.name)}
                                sx={{
                                    bgcolor: 'rgba(244,63,94,0.06)',
                                    '&:hover': {bgcolor: 'rgba(244,63,94,0.15)'}
                                }}
                            >
                                <DeleteOutlineIcon fontSize="small"/>
                            </IconButton>
                        </Box>

                        {/* Actions counter */}
                        <Chip
                            size="small"
                            label={`${group.actions.length} / ${MAX_ACTIONS_PER_GROUP}`}
                            sx={{
                                bgcolor: groupColor + '15',
                                color: groupColor,
                                fontWeight: 600,
                                fontSize: '0.75rem'
                            }}
                        />
                    </>
                )}
            </Box>

            {/* Actions Grid */}
            <Box sx={{p: 2}}>
                {group.actions.length === 0 ? (
                    <Box
                        sx={{
                            py: 4,
                            textAlign: 'center',
                            color: 'text.secondary',
                            borderRadius: 2,
                            border: '1px dashed',
                            borderColor: 'divider'
                        }}
                    >
                        <Typography variant="body2">
                            No actions in this group yet
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                            Create an action and assign it to this group
                        </Typography>
                    </Box>
                ) : (
                    <div
                        className="grid gap-3 w-full"
                        style={{
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'
                        }}
                    >
                        {group.actions.map((action) => (
                            <ActionCard
                                key={action.id}
                                action={action}
                                isDeleting={deletingActionIds.has(action.id)}
                                onEdit={onEditAction}
                                onDelete={onDeleteAction}
                                showPrompt={showPrompts}
                            />
                        ))}
                    </div>
                )}
            </Box>
        </Box>
    );
};

export default GroupCard;
