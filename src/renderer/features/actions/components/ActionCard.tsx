import React from 'react';
import {Box, Chip, IconButton, Stack, Typography} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StarsRoundedIcon from '@mui/icons-material/StarsRounded';
import {alpha} from '@mui/material/styles';
import type {ActionConfig} from '@shared/types';
import {getMediaUrl} from '@shared/constants';

type Props = {
    action: ActionConfig;
    isDeleting: boolean;
    onEdit: (action: ActionConfig) => void;
    onDelete: (id: string, name: string) => void;
    disabled?: boolean;
    showPrompt?: boolean;
};

const ActionCard: React.FC<Props> = ({action, isDeleting, onEdit, onDelete, disabled = false, showPrompt = false}) => {
    const isDefaultAction = Boolean(action.is_default);
    const truncate = (value: string, limit = 170) => {
        if (!value) {
            return '';
        }
        return value.length > limit ? `${value.slice(0, limit).trim()}вЂ¦` : value;
    };

    const promptText = action.prompt && action.prompt.trim().length > 0
        ? truncate(action.prompt.trim())
        : 'Speech will be transcribed verbatim into text and sent without any additional LLM processing.';

    const handleEdit = () => {
        if (disabled) {
            return;
        }
        onEdit(action);
    };

    return (
        <Box
            className={'action-card-wrap'}
            onClick={handleEdit}
            sx={(theme) => {
                const isDark = theme.palette.mode === 'dark';
                const neutralColor = '#6f6f6f';
                const darkSurface = theme.palette.background.default;
                const baseBorder = isDark
                    ? alpha(neutralColor, 0.2)
                    : 'rgba(255,196,205,0.41)';
                const hoverBorder = isDark
                    ? alpha(theme.palette.primary.main, 0.65)
                    : 'rgba(255,82,106,0.91)';
                const baseShadow = isDark
                    ? '0 28px 68px rgba(0, 0, 0, 0.82)'
                    : '0 12px 32px rgba(255,247,248,0.08)';
                const hoverShadow = isDark
                    ? '0 34px 84px rgba(0, 0, 0, 0.9)'
                    : '0 20px 40px rgba(244, 63, 94, 0.15)';
                return {
                    borderRadius: 2.5,
                    border: `2px solid ${baseBorder}`,
                    background: isDark ? darkSurface : theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    p: 2.4,
                    position: 'relative',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.65 : 1,
                    boxShadow: baseShadow,
                    transition: 'transform 260ms ease, box-shadow 260ms ease, border-color 260ms ease',
                    minWidth: 0,
                    '&:hover': disabled
                        ? undefined
                        : {
                            transform: 'translateY(-2px)',
                            boxShadow: hoverShadow,
                            border: `2px solid ${hoverBorder}`
                        },
                    '&:hover .action-card__delete, &:focus-within .action-card__delete': disabled ? undefined : {
                        opacity: 1,
                        pointerEvents: 'auto',
                        transform: 'translateY(0)'
                    }
                };
            }}
        >
            {action.is_active === false && (
                <div className={'w-full h-full absolute top-0 left-0 frcc'}>
                    <Box
                        component="span"
                        sx={(theme) => ({
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 999,
                            fontSize: 22,
                            backdropFilter: 'blur(20px)',
                            fontWeight: 700,
                            letterSpacing: 0.6,
                            textTransform: 'uppercase',
                            background: theme.palette.mode === 'dark'
                                ? 'rgba(248, 250, 252, 0.16)'
                                : 'rgba(15,23,42,0.08)',
                            color: theme.palette.text.primary
                        })}
                    >
                        Inactive
                    </Box>
                </div>
            )}
            <div className={'action-card'} style={{filter: action.is_active ? 'none' : 'blur(2px)'}}>
                {!isDefaultAction && (
                    <IconButton
                        className="action-card__delete"
                        size="small"
                        color="error"
                        disabled={isDeleting}
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete(action.id, action.name);
                        }}
                        sx={(theme) => {
                            const isDark = theme.palette.mode === 'dark';
                            return {
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                bgcolor: isDark ? alpha('#6f6f6f', 0.24) : alpha(theme.palette.primary.main, 0.06),
                                color: isDark ? '#ffffff' : undefined,
                                '&:hover': {
                                    bgcolor: isDark
                                        ? alpha(theme.palette.error.main, 0.38)
                                        : alpha(theme.palette.primary.main, 0.15)
                                },
                                transition: 'opacity 260ms ease, transform 260ms ease, background-color 260ms ease',
                                opacity: disabled ? 0.6 : 0,
                                pointerEvents: disabled ? 'auto' : 'none',
                                transform: disabled ? 'translateY(0)' : 'translateY(-4px)'
                            };
                        }}
                        aria-label="Delete action"
                    >
                        <DeleteOutlineIcon fontSize="small"/>
                    </IconButton>
                )}

                <Stack direction="row" spacing={2} alignItems="center">
                    <Box
                        sx={(theme) => {
                            const isDark = theme.palette.mode === 'dark';
                            const neutralColor = '#6f6f6f';
                            return {
                                width: 48,
                                height: 48,
                                borderRadius: 2.5,
                                background: isDark
                                    ? `linear-gradient(135deg, ${alpha(neutralColor, 0.32)}, ${alpha(neutralColor, 0.16)})`
                                    : 'linear-gradient(135deg, #ffe4e6, #fff5f7)',
                                border: `1px solid ${isDark ? alpha(neutralColor, 0.45) : 'rgba(244,63,94,0.2)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: isDark ? `inset 0 1px 0 ${alpha(neutralColor, 0.36)}` : undefined
                            };
                        }}
                    >
                        {action.icon_details?.svg ? (
                            <Box
                                component="img"
                                src={getMediaUrl(action.icon_details.svg)}
                                alt={action.icon_details.name || ''}
                                sx={(theme) => ({
                                    width: 30,
                                    height: 30,
                                    filter: theme.palette.mode === 'dark' ? 'brightness(0) invert(1)' : 'none'
                                })}
                            />
                        ) : (
                            <Typography
                                variant="h4"
                                sx={(theme) => ({
                                    color: theme.palette.mode === 'dark' ? '#ffffff' : undefined
                                })}
                            >
                                вљЎ
                            </Typography>
                        )}
                    </Box>

                    <Box flexGrow={1} minWidth={0}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{minWidth: 0}}>
                            <Typography variant="subtitle1" fontWeight={600} noWrap sx={{minWidth: 0}}>
                                {action.name}
                            </Typography>
                            {isDefaultAction && (
                                <Chip
                                    size="small"
                                    icon={<StarsRoundedIcon fontSize="small"/>}
                                    label="System"
                                    variant="outlined"
                                    color="secondary"
                                />
                            )}
                        </Stack>
                        {action.hotkey && (
                            <Typography variant="caption" color="text.secondary">
                                Hotkey: {action.hotkey}
                            </Typography>
                        )}
                    </Box>
                </Stack>

                {showPrompt && (
                    <Typography variant="body2" color="text.secondary" sx={{mt: 2}}>
                        {promptText}
                    </Typography>
                )}

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
            </div>
        </Box>
    );
};

export default ActionCard;

