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
    ListSubheader,
    MenuItem,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type {ActionFormValues} from '../hooks/useActionForm';
import HotkeyInput from '../../../components/HotkeyInput';
import {LLM_GEMINI_API_MODELS, LLM_LOCAL_MODELS, LLM_OPENAI_API_MODELS} from '@shared/constants';

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
    mode: 'create' | 'edit';
    saving: boolean;
    editingActionId: string | null;
    editingActionIsDefault: boolean;
    onSubmit: (event: React.FormEvent) => Promise<void>;
};

const DialogTransition = forwardRef(function DialogTransition(
    props: React.ComponentProps<typeof Fade>,
    ref: React.Ref<unknown>
) {
    return <Fade timeout={280} ref={ref} {...props} easing="cubic-bezier(0.4, 0, 0.2, 1)"/>;
});

const ActionForm: React.FC<Props> = ({
                                         icons,
                                         iconsLoading,
                                         values,
                                         setField,
                                         modal,
                                         mode,
                                         saving,
                                         editingActionId,
                                         editingActionIsDefault,
                                         onSubmit
                                     }) => {
    const isEditMode = mode === 'edit';
    const isNameLocked = isEditMode && editingActionIsDefault;
    const selectedIconName = icons.find((icon) => icon.id === values.iconId)?.name;

    return (
        <Dialog
            key={editingActionId ?? 'new'}
            open={modal.isModalVisible}
            onClose={modal.closeModal}
            maxWidth="sm"
            closeAfterTransition
            slots={{transition: DialogTransition}}
            slotProps={{
                paper: {
                    component: 'form',
                    onSubmit
                },
                transition: {
                    timeout: 280,
                    unmountOnExit: true,
                    mountOnEnter: true
                }
            }}
        >
            <DialogTitle className={'fc'}>
                <div className={'frbc gap-2'}>
                    <Typography variant="h5" fontWeight={600}>
                        {isEditMode ? 'Edit Action' : 'Create Action'}
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
                        required
                        disabled={isNameLocked}
                        helperText={isNameLocked ? 'Default action name cannot be changed.' : undefined}
                        sx={{mb: 1}}
                    />
                    <TextField
                        label="Priority"
                        type="number"
                        value={values.priority}
                        onChange={(event) => {
                            const nextValue = Number.parseInt(event.target.value, 10);
                            setField('priority', Number.isNaN(nextValue) ? 1 : Math.max(1, nextValue));
                        }}
                        inputProps={{min: 1, step: 1}}
                        helperText="Lower numbers mean higher priority. 1 goes first, 4 goes last."
                        fullWidth
                        sx={{mb: 1}}
                    />

                    <TextField
                        label="Prompt"
                        value={values.prompt}
                        onChange={(event) => setField('prompt', event.target.value)}
                        placeholder="For example: Just translate into English everything I say. Write nothing else. Keep the translation logical."
                        fullWidth
                        multiline

                        minRows={3}
                        sx={{mb: 1}}
                    />

                    <TextField
                        label="Prompt Recognizing"
                        value={values.promptRecognizing}
                        onChange={(event) => setField('promptRecognizing', event.target.value)}
                        placeholder="Optional: mention domain, key terms, language mix (e.g. 'Fintech, legal jargon, speech mostly RU with EN words and tenses')."
                        fullWidth
                        multiline
                        minRows={3}
                    />

                    <TextField
                        label="LLM Model"
                        value={values.llmModel ?? ''}
                        onChange={(event) => setField('llmModel', event.target.value)}
                        select
                        fullWidth
                        helperText="Optional: override the default LLM model for this action"
                        sx={{my: 1}}
                    >
                        <MenuItem value="">
                            <em>Use default from settings</em>
                        </MenuItem>
                        <ListSubheader
                            sx={{
                                backgroundColor: '#fff',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                color: 'text.primary',
                                lineHeight: '36px'
                            }}
                        >
                            OpenAI
                        </ListSubheader>
                        {LLM_OPENAI_API_MODELS.map((model) => (
                            <MenuItem key={model} value={model}>
                                {model}
                            </MenuItem>
                        ))}
                        <ListSubheader
                            sx={{
                                backgroundColor: '#fff',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                color: 'text.primary',
                                lineHeight: '36px'
                            }}
                        >
                            Google Gemini
                        </ListSubheader>
                        {LLM_GEMINI_API_MODELS.map((model) => (
                            <MenuItem key={model} value={model}>
                                {model}
                            </MenuItem>
                        ))}
                        <ListSubheader
                            sx={{
                                backgroundColor: '#fff',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                color: 'text.primary',
                                lineHeight: '36px'
                            }}
                        >
                            Ollama (Local)
                        </ListSubheader>
                        {LLM_LOCAL_MODELS.map((model) => (
                            <MenuItem key={model} value={model}>
                                {model}
                            </MenuItem>
                        ))}
                    </TextField>

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
                            Icon <Typography component="span" color="error.main">*</Typography>{' '}
                            {selectedIconName && (
                                <Typography component="span" variant="caption" color="text.secondary">
                                    • {selectedIconName}
                                </Typography>
                            )}
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
                                className="overflow-y-auto"
                                sx={{
                                    maxHeight: 155,
                                    overflowY: 'auto',
                                    pr: 0.5
                                }}
                            >
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
                                                    width: 48,
                                                    height: 48,
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
                                                    boxShadow: 'none'
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
                            </Box>
                        )}
                    </Stack>

                    <Stack spacing={1}>
                        <Typography variant="body2" color="text.primary" fontWeight={600}>
                            Options
                        </Typography>
                        <FormGroup row>
                            <FormControlLabel
                                control={<Checkbox
                                    checked={values.showResults}
                                    onChange={(event) => setField('showResults', event.target.checked)}
                                />}
                                label="Show result window"
                            />
                            <FormControlLabel
                                control={<Checkbox
                                    checked={values.soundOnComplete}
                                    onChange={(event) => setField('soundOnComplete', event.target.checked)}
                                />}
                                label="Play completion sound"
                            />
                            <FormControlLabel
                                control={<Checkbox
                                    checked={values.autoCopyResult}
                                    onChange={(event) => setField('autoCopyResult', event.target.checked)}
                                />}
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
                    {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Create action'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ActionForm;
