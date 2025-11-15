import React from 'react';
import {Box, Chip, IconButton, Stack, Typography} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type {ActionConfig} from '@shared/types';

type Props = {
    action: ActionConfig;
    isDeleting: boolean;
    onEdit: (action: ActionConfig) => void;
    onDelete: (id: string, name: string) => void;
    disabled?: boolean;
};

const ActionCard: React.FC<Props> = ({action, isDeleting, onEdit, onDelete, disabled = false}) => {
    const promptText = action.prompt && action.prompt.trim().length > 0
        ? action.prompt
        : 'Speech will be transcribed verbatim into text and sent without any additional LLM processing.';

    const handleEdit = () => {
        if (disabled) {
            return;
        }
        onEdit(action);
    };

    return (
        <Box
            onClick={handleEdit}
            sx={{
                borderRadius: 2.5,
                border: '1px solid rgba(2,6,23,0.08)',
                background: '#fff',
                color: '#0f172a',
                p: 2.4,
                position: 'relative',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.65 : 1,
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
                transition: 'transform 260ms ease, box-shadow 260ms ease, border-color 260ms ease',
                '&:hover': disabled
                    ? undefined
                    : {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 20px 40px rgba(244, 63, 94, 0.15)',
                        borderColor: 'rgba(244,63,94,0.6)'
                    },
                '&:hover .action-card__delete, &:focus-within .action-card__delete': disabled ? undefined : {
                    opacity: 1,
                    pointerEvents: 'auto',
                    transform: 'translateY(0)'
                }
            }}
        >
            {action.is_active === false && (
                <Box
                    component="span"
                    sx={{
                        position: 'absolute',
                        top: 12,
                        left: 16,
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        background: 'rgba(15,23,42,0.08)',
                        color: '#0f172a'
                    }}
                >
                    Inactive
                </Box>
            )}

            <IconButton
                className="action-card__delete"
                size="small"
                color="error"
                disabled={isDeleting}
                onClick={(event) => {
                    event.stopPropagation();
                    onDelete(action.id, action.name);
                }}
                sx={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    bgcolor: 'rgba(244,63,94,0.06)',
                    '&:hover': {bgcolor: 'rgba(244,63,94,0.15)'},
                    transition: 'opacity 260ms ease, transform 260ms ease, background-color 260ms ease',
                    opacity: disabled ? 0.6 : 0,
                    pointerEvents: disabled ? 'auto' : 'none',
                    transform: disabled ? 'translateY(0)' : 'translateY(-4px)'
                }}
                aria-label="Delete action"
            >
                <DeleteOutlineIcon fontSize="small"/>
            </IconButton>

            <Stack direction="row" spacing={2} alignItems="center">
                <Box
                    sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2.5,
                        background: 'linear-gradient(135deg, #ffe4e6, #fff5f7)',
                        border: '1px solid rgba(244,63,94,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    {action.icon_details?.svg ? (
                        <Box
                            component="img"
                            src={action.icon_details.svg}
                            alt={action.icon_details.name || ''}
                            sx={{width: 30, height: 30}}
                        />
                    ) : (
                        <Typography variant="h4">⚡</Typography>
                    )}
                </Box>

                <Box flexGrow={1} minWidth={0}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                        {action.name}
                    </Typography>
                    {action.hotkey && (
                        <Typography variant="caption" color="text.secondary">
                            Hotkey: {action.hotkey}
                        </Typography>
                    )}
                </Box>
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{mt: 2}}>
                {promptText}
            </Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap" mt={2}>
                {action.show_results && (
                    <Chip size="small" label="Result window" color="primary" variant="outlined"/>
                )}
                {action.sound_on_complete && (
                    <Chip size="small" label="Sound" color="secondary" variant="outlined"/>
                )}
                {action.auto_copy_result && (
                    <Chip size="small" label="Clipboard" color="success" variant="outlined"/>
                )}
            </Stack>
        </Box>
    );
};

export default ActionCard;
