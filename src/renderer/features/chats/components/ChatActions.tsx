import React, {useCallback, useState} from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    TextField
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';

interface ChatActionsProps {
    chatTitle: string;
    onRename: (newTitle: string) => Promise<void>;
    onDelete: () => Promise<void>;
    disabled?: boolean;
    compact?: boolean;
}

const ChatActions: React.FC<ChatActionsProps> = ({chatTitle, onRename, onDelete, disabled, compact}) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [saving, setSaving] = useState(false);

    const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    }, []);

    const handleMenuClose = useCallback(() => {
        setAnchorEl(null);
    }, []);

    const handleRenameClick = useCallback(() => {
        setNewTitle(chatTitle);
        setRenameDialogOpen(true);
        handleMenuClose();
    }, [chatTitle, handleMenuClose]);

    const handleDeleteClick = useCallback(() => {
        setDeleteDialogOpen(true);
        handleMenuClose();
    }, [handleMenuClose]);

    const handleRenameConfirm = useCallback(async () => {
        if (!newTitle.trim() || saving) return;
        setSaving(true);
        try {
            await onRename(newTitle.trim());
            setRenameDialogOpen(false);
        } finally {
            setSaving(false);
        }
    }, [newTitle, saving, onRename]);

    const handleDeleteConfirm = useCallback(async () => {
        if (saving) return;
        setSaving(true);
        try {
            await onDelete();
            setDeleteDialogOpen(false);
        } finally {
            setSaving(false);
        }
    }, [saving, onDelete]);

    const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleRenameConfirm();
        }
    }, [handleRenameConfirm]);

    return (
        <>
            <IconButton
                size="small"
                onClick={handleMenuOpen}
                disabled={disabled}
                sx={{
                    color: 'text.secondary',
                    backgroundColor: 'transparent',
                    boxShadow: 'none',
                    '&:hover': {
                        backgroundColor: 'transparent',
                        boxShadow: 'none'
                    },
                    ...(compact && {padding: '4px'})
                }}
            >
                <MoreVertIcon sx={{fontSize: compact ? 18 : 20}}/>
            </IconButton>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <MenuItem onClick={handleRenameClick}>
                    <ListItemIcon>
                        <EditRoundedIcon fontSize="small"/>
                    </ListItemIcon>
                    <ListItemText>Rename</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDeleteClick} sx={{color: 'error.main'}}>
                    <ListItemIcon>
                        <DeleteOutlineRoundedIcon fontSize="small" color="error"/>
                    </ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                </MenuItem>
            </Menu>

            {/* Rename Dialog */}
            <Dialog
                open={renameDialogOpen}
                onClose={() => !saving && setRenameDialogOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Rename Chat</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        placeholder="Enter new title"
                        disabled={saving}
                        sx={{mt: 1}}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRenameDialogOpen(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleRenameConfirm}
                        variant="contained"
                        disabled={!newTitle.trim() || saving}
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={() => !saving && setDeleteDialogOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Delete Chat</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this chat? This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteConfirm}
                        color="error"
                        variant="contained"
                        disabled={saving}
                    >
                        {saving ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default ChatActions;
