import React from 'react';
import {
    Box,
    Card,
    CardActionArea,
    CardContent,
    Chip,
    IconButton,
    Stack,
    Typography
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type {ActionConfig} from '@shared/types';

type Props = {
    actions: ActionConfig[];
    deletingIds: Set<string>;
    onEdit: (action: ActionConfig) => void;
    onDelete: (actionId: string, actionName: string) => void;
};

const ActionList: React.FC<Props> = ({actions, deletingIds, onEdit, onDelete}) => (
    <Box
        sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {xs: '1fr', md: '1fr 1fr'}
        }}
    >
        {actions.map((action) => {
            const isDeleting = deletingIds.has(action.id);
            const handleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onDelete(action.id, action.name);
            };
            const promptText = action.prompt && action.prompt.trim().length > 0
                ? action.prompt
                : 'Речь будет дословно преобразована в текст и отправлена без дополнительной LLM‑обработки.';

            return (
                <Box key={action.id}>
                    <Card
                        sx={{
                            borderRadius: 4,
                            border: '1px solid rgba(2,6,23,0.08)',
                            position: 'relative',
                            overflow: 'visible',
                            bgcolor: '#fff',
                            color: '#0f172a',
                            boxShadow: '0 8px 30px rgba(15,23,42,0.06)'
                        }}
                        elevation={0}
                    >
                        <CardActionArea
                            sx={{borderRadius: 4, alignItems: 'stretch', display: 'flex'}}
                            onClick={() => onEdit(action)}
                        >
                            <CardContent sx={{width: '100%'}}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box
                                        sx={{
                                            width: 56,
                                            height: 56,
                                            borderRadius: 3,
                                            bgcolor: '#f9fafb',
                                            border: '1px solid rgba(2,6,23,0.07)',
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
                                                sx={{width: 32, height: 32}}
                                            />
                                        ) : (
                                            <Typography variant="h4">⚡</Typography>
                                        )}
                                    </Box>
                                    <Box flexGrow={1} minWidth={0}>
                                        <Typography variant="subtitle1" fontWeight={600} noWrap>
                                            {action.name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" noWrap>
                                            {action.icon_details?.name || 'No icon'}
                                        </Typography>
                                        {action.hotkey && (
                                            <Typography variant="caption" color="text.secondary">
                                                Hotkey: {action.hotkey}
                                            </Typography>
                                        )}
                                    </Box>
                                    <IconButton
                                        color="error"
                                        disabled={isDeleting}
                                        onClick={handleDeleteClick}
                                    >
                                        <DeleteOutlineIcon fontSize="small"/>
                                    </IconButton>
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
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Box>
            );
        })}
    </Box>
);

export default ActionList;
