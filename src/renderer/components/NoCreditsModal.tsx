import React from 'react';
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography} from '@mui/material';
import {open} from '@tauri-apps/plugin-shell';
import {SITE_BASE_URL} from '@shared/constants';

interface NoCreditsModalProps {
    open: boolean;
    onClose: () => void;
}

const NoCreditsModal: React.FC<NoCreditsModalProps> = ({open: isOpen, onClose}) => {
    const handleTopUp = () => {
        void open(`${SITE_BASE_URL}/profile/general?open_top_up=1`);
        onClose();
    };

    return (
        <Dialog open={isOpen} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{pb: 1}}>
                <Typography variant="h6" component="h3" fontWeight={700}>
                    Not Enough Credits
                </Typography>
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary">
                    You don't have enough credits to complete this request.
                    Top up your balance to continue using AI features.
                </Typography>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} color="inherit">
                    Cancel
                </Button>
                <Button onClick={handleTopUp} variant="contained" color="primary">
                    Top Up
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default NoCreditsModal;
