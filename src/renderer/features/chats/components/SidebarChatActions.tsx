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
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';

interface SidebarChatActionsProps {
    chatId: string;
    chatTitle: string;
    isPinned: boolean;
    isInPanel: boolean;
    showAddToPanel: boolean;
    onRename: (chatId: string, newTitle: string) => Promise<void>;
    onDelete: (chatId: string) => Promise<void>;
    onTogglePin: (chatId: string, isPinned: boolean) => Promise<void>;
    onAddToPanel: (chatId: string) => void;
    disabled?: boolean;
    className?: string;
}

const SidebarChatActions: React.FC<SidebarChatActionsProps> = ({
    chatId,
    chatTitle,
    isPinned,
    isInPanel,
    showAddToPanel,
    onRename,
    onDelete,
    onTogglePin,
    onAddToPanel,
    disabled,
    className
}) => {
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

    const handlePinClick = useCallback(async () => {
        handleMenuClose();
        await onTogglePin(chatId, isPinned);
    }, [chatId, isPinned, onTogglePin, handleMenuClose]);

    const handleAddToPanelClick = useCallback(() => {
        handleMenuClose();
        onAddToPanel(chatId);
    }, [chatId, onAddToPanel, handleMenuClose]);

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
            await onRename(chatId, newTitle.trim());
            setRenameDialogOpen(false);
        } finally {
            setSaving(false);
        }
    }, [chatId, newTitle, saving, onRename]);

    const handleDeleteConfirm = useCallback(async () => {
        if (saving) return;
        setSaving(true);
        try {
            await onDelete(chatId);
            setDeleteDialogOpen(false);
        } finally {
            setSaving(false);
        }
    }, [chatId, saving, onDelete]);

    const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleRenameConfirm();
        }
    }, [handleRenameConfirm]);

    // Показывать "Добавить в панель" только если: showAddToPanel=true И чат ещё не в панели
    const showAddToPanelItem = showAddToPanel && !isInPanel;

    return (
        <>
            <IconButton
                size="small"
                onClick={handleMenuOpen}
                disabled={disabled}
                className={className}
                sx={{
                    color: 'text.secondary',
                    backgroundColor: 'transparent',
                    boxShadow: 'none',
                    padding: '2px',
                    '&:hover': {
                        backgroundColor: 'transparent',
                        boxShadow: 'none'
                    }
                }}
            >
                <MoreVertIcon sx={{fontSize: 16}}/>
            </IconButton>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
                onClick={(e) => e.stopPropagation()}
            >
                <MenuItem onClick={handlePinClick}>
                    <ListItemIcon>
                        {isPinned ? (
                            <PushPinOutlinedIcon fontSize="small"/>
                        ) : (
                            <PushPinRoundedIcon fontSize="small"/>
                        )}
                    </ListItemIcon>
                    <ListItemText>{isPinned ? 'Unpin' : 'Pin'}</ListItemText>
                </MenuItem>
                {showAddToPanelItem && (
                    <MenuItem onClick={handleAddToPanelClick}>
                        <ListItemIcon>
                            <ViewColumnRoundedIcon fontSize="small"/>
                        </ListItemIcon>
                        <ListItemText>Add to panel</ListItemText>
                    </MenuItem>
                )}
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
                onClick={(e) => e.stopPropagation()}
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
                onClick={(e) => e.stopPropagation()}
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

export default SidebarChatActions;
