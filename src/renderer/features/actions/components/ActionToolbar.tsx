import React from 'react';
import {Box, Button, FormControlLabel, Switch} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {alpha} from '@mui/material/styles';

type Props = {
    actionsCount: number;
    groupsCount: number;
    showPrompts: boolean;
    onToggleShowPrompts: (show: boolean) => void;
    onCreateAction: () => void;
    onCreateGroup: () => void;
};

const CountBadge: React.FC<{ count: number }> = ({count}) => (
    <Box
        component="span"
        sx={(theme) => {
            const isDark = theme.palette.mode === 'dark';
            return {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 20,
                height: 20,
                px: 0.75,
                borderRadius: '10px',
                bgcolor: isDark ? alpha(theme.palette.primary.main, 0.24) : alpha(theme.palette.primary.main, 0.15),
                border: isDark ? `1px solid ${alpha(theme.palette.primary.main, 0.42)}` : 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: isDark ? '#ffffff' : theme.palette.primary.main,
                ml: 0.75
            };
        }}
    >
        {count}
    </Box>
);

const ActionToolbar: React.FC<Props> = ({actionsCount, groupsCount, showPrompts, onToggleShowPrompts, onCreateAction, onCreateGroup}) => (
    <div className="frbc flex-wrap gap-4">
        <h1 className="text-3xl font-semibold text-text-primary">Actions</h1>
        <div className="fr gap-2 items-center">
            <FormControlLabel
                control={
                    <Switch
                        size="small"
                        checked={showPrompts}
                        onChange={(e) => onToggleShowPrompts(e.target.checked)}
                        sx={(theme) => {
                            const isDark = theme.palette.mode === 'dark';
                            return {
                                '& .MuiSwitch-switchBase': {
                                    transform: 'translateY(-1px)'
                                },
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: theme.palette.primary.main,
                                    transform: 'translateX(16px) translateY(-1px)'
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: theme.palette.primary.main
                                },
                                '& .MuiSwitch-track': {
                                    backgroundColor: isDark
                                        ? alpha(theme.palette.text.primary, 0.3)
                                        : 'rgba(0, 0, 0, 0.25)'
                                }
                            };
                        }}
                    />
                }
                label="Prompts"
                sx={{
                    mr: 1,
                    gap: 0.25,
                    '& .MuiFormControlLabel-label': {
                        fontSize: '0.875rem',
                        color: 'text.secondary'
                    }
                }}
            />
            <Button
                variant="outlined"
                onClick={onCreateGroup}
                startIcon={<AddIcon/>}
                sx={{
                    borderColor: 'divider',
                    px: 1.5,
                    py: 0.5,
                    minHeight: 0
                }}
            >
                Group
                <CountBadge count={groupsCount}/>
            </Button>
            <Button
                variant="outlined"
                onClick={onCreateAction}
                startIcon={<AddIcon/>}
                sx={{
                    borderColor: 'divider',
                    px: 1.5,
                    py: 0.5,
                    minHeight: 0
                }}
            >
                Action
                <CountBadge count={actionsCount}/>
            </Button>
        </div>
    </div>
);

export default ActionToolbar;
