import React from 'react';
import {Box} from '@mui/material';
import ActionCard from './ActionCard';
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
        {actions.map((action) => (
            <ActionCard
                key={action.id}
                action={action}
                isDeleting={deletingIds.has(action.id)}
                onEdit={onEdit}
                onDelete={onDelete}
            />
        ))}
    </Box>
);

export default ActionList;
