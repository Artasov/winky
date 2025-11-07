import React from 'react';
import {Button, Paper, Stack, Typography} from '@mui/material';

type Props = {
    title: string;
    description: string;
    ctaLabel: string;
    onCta: () => void;
};

const ActionEmptyState: React.FC<Props> = ({title, description, ctaLabel, onCta}) => (
    <Paper
        elevation={0}
        sx={{
            borderRadius: 4,
            border: '1px dashed',
            borderColor: 'divider',
            px: 4,
            py: 8,
            textAlign: 'center',
            bgcolor: '#fff',
            color: '#0f172a',
            boxShadow: '0 12px 40px rgba(15, 23, 42, 0.08)'
        }}
    >
        <Stack spacing={2} alignItems="center">
            <Typography variant="h3" component="div" color="text.secondary">
                ⚡
            </Typography>
            <Typography variant="h6" fontWeight={600}>
                {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                {description}
            </Typography>
            <Button variant="contained" onClick={onCta}>
                {ctaLabel}
            </Button>
        </Stack>
    </Paper>
);

export default ActionEmptyState;
