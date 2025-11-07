import React from 'react';
import {
    Box,
    Chip,
    IconButton,
    Stack,
    Typography
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type {ActionConfig} from '@shared/types';

type Props = {
    action: ActionConfig;
    isDeleting: boolean;
    onEdit: (action: ActionConfig) => void;
    onDelete: (id: string, name: string) => void;
};

const ActionCard: React.FC<Props> = ({action, isDeleting, onEdit, onDelete}) => {
    const promptText = action.prompt && action.prompt.trim().length > 0
        ? action.prompt
        : 'Речь будет дословно преобразована в текст и отправлена без дополнительной LLM‑обработки.';

    return (
        <Box
            onClick={() => onEdit(action)}
            sx={{
                borderRadius: 2.5,
                border: '1px solid rgba(2,6,23,0.08)',
                background: '#fff',
                color: '#0f172a',
                p: 2.4,
                position: 'relative',
                cursor: 'pointer',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
                transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 20px 40px rgba(244, 63, 94, 0.15)',
                    borderColor: 'rgba(244,63,94,0.6)'
                }
            }}
        >
            <IconButton
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
                    '&:hover': {bgcolor: 'rgba(244,63,94,0.15)'}
                }}
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
