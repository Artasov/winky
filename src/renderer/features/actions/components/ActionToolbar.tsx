import React from 'react';
import {Button} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

type Props = {
    actionsCount: number;
    onCreate: () => void;
};

const ActionToolbar: React.FC<Props> = ({actionsCount, onCreate}) => (
    <div className="frbc flex-wrap gap-4">
        <div className="fc gap-1">
            <h1 className="text-3xl font-semibold text-text-primary">Actions</h1>
            <p className="text-sm text-text-secondary">
                Manage quick scenarios for your voice assistant.
            </p>
        </div>
        <Button
            variant="contained"
            onClick={onCreate}
            startIcon={<AddIcon/>}
        >
            Create action ({actionsCount})
        </Button>
    </div>
);

export default ActionToolbar;
