import React from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {BugReportFormPayload, useBugReportState} from './useBugReportState';

type BugReportModalProps = {
    open: boolean;
    onClose: () => void;
    onSubmit?: (payload: BugReportFormPayload) => Promise<void>;
};

const formatSizeKb = (size: number): string => `${Math.round(size / 1024)} KB`;

const BugReportModal: React.FC<BugReportModalProps> = ({open, onClose, onSubmit}) => {
    const {fields, flags, actions, refs} = useBugReportState(open, onSubmit);
    const {subject, message, telegram, files} = fields;
    const {submitting, success, error, isSubmitDisabled} = flags;
    const {setSubject, setMessage, setTelegram, handleFileChange, handleSubmit, resetAfterClose} = actions;
    const {fileInputRef} = refs;

    const handleClose = () => {
        if (submitting) return;
        resetAfterClose();
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth keepMounted>
            <DialogTitle>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                    <div>
                        <Typography variant="h6" component="h3" fontWeight={700}>
                            Report a problem
                        </Typography>
                    </div>
                    <IconButton aria-label="Close report window" onClick={handleClose} disabled={submitting}>
                        <CloseIcon fontSize="small"/>
                    </IconButton>
                </Box>
            </DialogTitle>

            <form onSubmit={handleSubmit} className={'-mt-1'}>
                <DialogContent dividers sx={{pt: 1, pb: 0, maxHeight: '70vh'}}>
                    {!success ? (
                        <Stack spacing={1.5}>
                            <Typography variant="body2" color="text.secondary">
                                Describe what happened. A contact is required so we can reply.
                            </Typography>

                            <TextField
                                required
                                id="bug-report-subject"
                                label="Subject"
                                value={subject}
                                onChange={(event) => setSubject(event.target.value)}
                                autoFocus
                            />

                            <TextField
                                required
                                id="bug-report-message"
                                label="What happened?"
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                multiline
                                minRows={4}
                                placeholder="Briefly describe the problem and steps to reproduce."
                            />

                            <Stack spacing={0.5}>
                                <TextField
                                    required
                                    id="bug-report-telegram"
                                    label="Contact for reply (Telegram or email)"
                                    value={telegram}
                                    onChange={(event) => setTelegram(event.target.value)}
                                    placeholder="e.g. @nickname or mail@example.com"
                                />
                                <Typography variant="caption" color="text.secondary">
                                    We need a contact to follow up on your report.
                                </Typography>
                            </Stack>

                            <Stack spacing={1}>
                                <Button
                                    variant="outlined"
                                    className="w-fit"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={submitting}
                                >
                                    Attach screenshots
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    hidden
                                    onChange={handleFileChange}
                                />
                                {files.length > 0 ? (
                                    <List dense disablePadding>
                                        {files.map((file) => (
                                            <ListItem
                                                key={`${file.name}-${file.lastModified}`}
                                                disableGutters
                                                sx={{py: 0.25}}
                                            >
                                                <ListItemText
                                                    primary={file.name}
                                                    secondary={formatSizeKb(file.size)}
                                                    primaryTypographyProps={{variant: 'body2'}}
                                                    secondaryTypographyProps={{variant: 'caption'}}
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                ) : null}
                            </Stack>
                        </Stack>
                    ) : (
                        <Stack spacing={1.5}>
                            <Typography variant="body1" fontWeight={700}>
                                Thank you! Report saved.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                We'll review it and get back to you as soon as we figure it out.
                            </Typography>
                        </Stack>
                    )}

                    {error ? <Alert severity="error" sx={{mt: 2}}>{error}</Alert> : null}
                </DialogContent>

                <DialogActions>
                    <Button onClick={handleClose} disabled={submitting}>
                        {success ? 'Close' : 'Cancel'}
                    </Button>
                    {!success ? (
                        <Button type="submit" variant="contained" disabled={isSubmitDisabled}>
                            {submitting ? 'Sending…' : 'Send'}
                        </Button>
                    ) : null}
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default BugReportModal;
