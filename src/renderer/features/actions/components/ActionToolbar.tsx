import React from 'react';
import {Button, Stack, Typography} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

type Props = {
    actionsCount: number;
    onCreate: () => void;
};

const ActionToolbar: React.FC<Props> = ({actionsCount, onCreate}) => (
    <Stack
        className={'actions-page-toolbar'}
        direction={{xs: 'column', sm: 'row'}}
        alignItems={{xs: 'flex-start', sm: 'center'}}
        justifyContent="space-between"
        spacing={2}
    >
        <div>
            <Typography variant="h4" fontWeight={600}>
                Actions
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Manage quick scenarios for your voice assistant.
            </Typography>
        </div>
        <Button
            variant="contained"
            onClick={onCreate}
            startIcon={<AddIcon/>}
            sx={{alignSelf: {xs: 'stretch', sm: 'auto'}}}
        >
            Create action ({actionsCount})
        </Button>
    </Stack>
);

export default ActionToolbar;
