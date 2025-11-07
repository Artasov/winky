import React, {forwardRef} from 'react';
import {
    Box,
    Button,
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
            maxWidth="sm"
            slots={{transition: DialogTransition}}
            slotProps={{
                paper: {
                    component: 'form',
                    onSubmit
                }
            }}
        >
            <DialogTitle className={'fc'}>
                <div className={'frbc gap-2'}>
                    <Typography variant="h5" fontWeight={600}>
                        {editingActionId ? 'Edit Action' : 'Create Action'}
                    </Typography>
                    <IconButton onClick={modal.closeModal} size="small">
                        <CloseIcon fontSize="small"/>
                    </IconButton>
                </div>
                <Typography variant="body2" color="text.secondary">
                    Configure how Winky should react to this shortcut.
                </Typography>
            </DialogTitle>
            <DialogContent>
                <div className={'fc gap-2 pt-2'}>
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
                        <Typography variant="body2" color="text.primary" fontWeight={600}>
                            Hotkey
                        </Typography>
                        <HotkeyInput value={values.hotkey ?? ''} onChange={(next) => setField('hotkey', next)}/>

                        <Typography variant="caption" color="text.secondary">
                            Press the shortcut you want to assign.
                        </Typography>
                    </Stack>

                    <Stack spacing={1}>
                        <Typography variant="body2" color="text.primary" fontWeight={600}>
                            Icon {selectedIconName && <Typography component="span" variant="caption"
                                                                  color="text.secondary">• {selectedIconName}</Typography>}
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
                            <div className={'frsc gap-1 flex-wrap'}>
                                {icons.map((icon) => {
                                    const isSelected = values.iconId === icon.id;
                                    return (
                                        <IconButton
                                            key={icon.id}
                                            size={'small'}
                                            aria-pressed={isSelected}
                                            onClick={() => setField('iconId', icon.id)}
                                            sx={(theme) => ({
                                                width: '100%',
                                                aspectRatio: '1 / 1',
                                                minHeight: 0,
                                                padding: 0,
                                                borderStyle: 'solid',
                                                borderWidth: 2,
                                                borderColor: isSelected
                                                    ? theme.palette.primary.main
                                                    : theme.palette.primary.main + '00',
                                                backgroundColor: isSelected
                                                    ? 'rgba(244, 63, 94, 0.18)'
                                                    : 'rgba(15, 23, 42, 0.03)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 260ms ease',
                                                '&:hover': {
                                                    backgroundColor: 'rgba(244, 63, 94, 0.18)',
                                                    borderColor: theme.palette.primary.main
                                                },
                                                width: '45px'
                                            })}
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
                                        </IconButton>
                                    );
                                })}
                            </div>
                        )}
                    </Stack>

                    <Stack spacing={1}>
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
                </div>
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
        </Dialog>
    );
};

export default ActionForm;
