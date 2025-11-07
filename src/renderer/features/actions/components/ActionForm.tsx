import React, {forwardRef} from 'react';
import {
    Box,
    Button,
    ButtonBase,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fade,
    FormControlLabel,
    FormGroup,
    IconButton,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type {ActionFormValues} from '../hooks/useActionForm';
import HotkeyInput from '../../../components/HotkeyInput';

type ModalProps = {
    isModalVisible: boolean;
    closeModal: () => void;
};

type Props = {
    icons: Array<{ id: string; name: string; emoji?: string; svg?: string }>;
    iconsLoading: boolean;
    values: ActionFormValues;
    setField: <K extends keyof ActionFormValues>(key: K, value: ActionFormValues[K]) => void;
    modal: ModalProps;
    saving: boolean;
    editingActionId: string | null;
    onSubmit: (event: React.FormEvent) => Promise<void>;
};

const DialogTransition = forwardRef(function DialogTransition(
    props: React.ComponentProps<typeof Fade>,
    ref: React.Ref<unknown>
) {
    return <Fade timeout={200} ref={ref} {...props} />;
});

const ActionForm: React.FC<Props> = ({
    icons,
    iconsLoading,
    values,
    setField,
    modal,
    saving,
    editingActionId,
    onSubmit
}) => {
    const selectedIconName = icons.find((icon) => icon.id === values.iconId)?.name;

    return (
        <Dialog
            open={modal.isModalVisible}
            onClose={modal.closeModal}
            TransitionComponent={DialogTransition}
            fullWidth
            maxWidth="sm"
            slotProps={{
                backdrop: {
                    timeout: 200
                }
            }}
            PaperProps={{
                sx: {
                    bgcolor: '#fff',
                    color: '#0f172a'
                },
                component: 'form',
                onSubmit
            }}
        >
            <Box>
                <DialogTitle
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        pr: 1
                    }}
                >
                    <div>
                        <Typography variant="h6" component="p" fontWeight={600}>
                            {editingActionId ? 'Edit Action' : 'Create Action'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Configure how Winky should react to this shortcut.
                        </Typography>
                    </div>
                    <IconButton onClick={modal.closeModal} size="small">
                        <CloseIcon fontSize="small"/>
                    </IconButton>
                </DialogTitle>

                <DialogContent
                    dividers={false}
                    sx={{
                        pt: 2,
                        px: 3,
                        maxHeight: '65vh',
                        overflowY: 'auto'
                    }}
                >
                    <Stack spacing={3}>
                        <TextField
                            label="Action name"
                            value={values.name}
                            onChange={(event) => setField('name', event.target.value)}
                            placeholder="Send daily standup"
                            fullWidth
                        />

                        <TextField
                            label="Prompt"
                            value={values.prompt}
                            onChange={(event) => setField('prompt', event.target.value)}
                            placeholder="Summarize last 5 Jira updates..."
                            fullWidth
                            multiline
                            minRows={3}
                        />

                        <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary" fontWeight={600}>
                                Hotkey
                            </Typography>
                            <Box
                                sx={{
                                    borderRadius: 2,
                                    border: '1px solid rgba(15,23,42,0.12)',
                                    px: 2,
                                    py: 1.5,
                                    bgcolor: '#fff',
                                    transition: 'border-color 220ms ease, box-shadow 220ms ease',
                                    '&:hover': {
                                        borderColor: 'rgba(244,63,94,0.6)'
                                    },
                                    '&:focus-within': {
                                        borderColor: 'primary.main',
                                        boxShadow: '0 10px 24px rgba(244,63,94,0.12)'
                                    }
                                }}
                            >
                                <HotkeyInput value={values.hotkey ?? ''} onChange={(next) => setField('hotkey', next)}/>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                Press the shortcut you want to assign.
                            </Typography>
                        </Stack>

                    <Stack spacing={1}>
                        <Typography variant="body2" color="text.secondary">
                            Icon {selectedIconName && <Typography component="span" variant="caption" color="text.secondary">• {selectedIconName}</Typography>}
                        </Typography>
                        {iconsLoading ? (
                            <Box
                                sx={{
                                    borderRadius: 2,
                                    border: '1px dashed',
                                    borderColor: 'divider',
                                    py: 4,
                                    textAlign: 'center',
                                    color: 'text.secondary'
                                }}
                            >
                                Loading icons…
                            </Box>
                        ) : icons.length === 0 ? (
                            <Box
                                sx={{
                                    borderRadius: 2,
                                    border: '1px dashed',
                                    borderColor: 'divider',
                                    py: 4,
                                    textAlign: 'center',
                                    color: 'text.secondary'
                                }}
                            >
                                No icons available.
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {xs: 'repeat(4, 1fr)', sm: 'repeat(6, 1fr)'},
                                    gap: 1.5
                                }}
                            >
                                {icons.map((icon) => {
                                    const isSelected = values.iconId === icon.id;
                                    return (
                                        <ButtonBase
                                            key={icon.id}
                                            onClick={() => setField('iconId', icon.id)}
                                            sx={{
                                                borderRadius: 3,
                                                border: '1.5px solid',
                                                borderColor: isSelected ? 'primary.main' : 'rgba(15,23,42,0.1)',
                                                bgcolor: '#fff',
                                                height: 48,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'border-color 220ms ease, box-shadow 220ms ease',
                                                boxShadow: isSelected ? '0 10px 20px rgba(244,63,94,0.16)' : 'none',
                                                '&:hover': {
                                                    borderColor: 'primary.light',
                                                    boxShadow: '0 6px 16px rgba(244,63,94,0.1)'
                                                }
                                            }}
                                        >
                                            {icon.emoji ? (
                                                <Typography variant="h5" component="span">
                                                    {icon.emoji}
                                                </Typography>
                                            ) : (
                                                <Box
                                                    component="img"
                                                    src={icon.svg}
                                                    alt={icon.name}
                                                    sx={{width: 24, height: 24}}
                                                />
                                            )}
                                        </ButtonBase>
                                    );
                                })}
                            </Box>
                        )}
                    </Stack>

                        <Typography variant="body2" color="text.primary" fontWeight={600}>
                            Options
                        </Typography>
                        <FormGroup row>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={values.showResults}
                                        onChange={(event) => setField('showResults', event.target.checked)}
                                    />
                                }
                                label="Show result window"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={values.soundOnComplete}
                                        onChange={(event) => setField('soundOnComplete', event.target.checked)}
                                    />
                                }
                                label="Play completion sound"
                            />
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={values.autoCopyResult}
                                        onChange={(event) => setField('autoCopyResult', event.target.checked)}
                                    />
                                }
                                label="Copy result to clipboard"
                            />
                        </FormGroup>
                    </Stack>
                </DialogContent>

                <DialogActions sx={{px: 3, py: 2.5}}>
                    <Button onClick={modal.closeModal} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={saving || iconsLoading || icons.length === 0 || !values.iconId}
                    >
                        {saving ? 'Saving…' : editingActionId ? 'Save changes' : 'Create action'}
                    </Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
};

export default ActionForm;
