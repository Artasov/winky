import React, {forwardRef} from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Fade,
    IconButton,
    TextField,
    Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type {ActionIcon} from '@shared/types';
import {getMediaUrl} from '@shared/constants';

export type GroupFormValues = {
    name: string;
    description: string;
    color: string;
    iconId: string;
    priority: number;
};

type ModalProps = {
    isModalVisible: boolean;
    closeModal: () => void;
};

type Props = {
    icons: ActionIcon[];
    iconsLoading: boolean;
    values: GroupFormValues;
    setField: <K extends keyof GroupFormValues>(key: K, value: GroupFormValues[K]) => void;
    modal: ModalProps;
    mode: 'create' | 'edit';
    saving: boolean;
    onSubmit: (event: React.FormEvent) => Promise<void>;
};

const DialogTransition = forwardRef(function DialogTransition(
    props: React.ComponentProps<typeof Fade>,
    ref: React.Ref<unknown>
) {
    return <Fade timeout={280} ref={ref} {...props} easing="cubic-bezier(0.4, 0, 0.2, 1)"/>;
});

const COLOR_PRESETS = [
    '#f43f5e', // rose
    '#ec4899', // pink
    '#a855f7', // purple
    '#6366f1', // indigo
    '#3b82f6', // blue
    '#06b6d4', // cyan
    '#10b981', // emerald
    '#84cc16', // lime
    '#f59e0b', // amber
    '#f97316', // orange
];

const GroupForm: React.FC<Props> = ({
    icons,
    iconsLoading,
    values,
    setField,
    modal,
    mode,
    saving,
    onSubmit
}) => {
    const isEditMode = mode === 'edit';
    const selectedIconName = icons.find((icon) => icon.id === values.iconId)?.name;

    return (
        <Dialog
            open={modal.isModalVisible}
            onClose={modal.closeModal}
            maxWidth="sm"
            fullWidth
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
                        {isEditMode ? 'Edit Group' : 'Create Group'}
                    </Typography>
                    <IconButton onClick={modal.closeModal} size="small">
                        <CloseIcon fontSize="small"/>
                    </IconButton>
                </div>
                <Typography variant="body2" color="text.secondary">
                    Organize your actions into groups for quick access.
                </Typography>
            </DialogTitle>

            <DialogContent>
                <div className={'fc gap-3 pt-2'}>
                    <TextField
                        label="Group name"
                        value={values.name}
                        onChange={(e) => setField('name', e.target.value)}
                        placeholder="Work tasks"
                        fullWidth
                        required
                    />

                    <TextField
                        label="Description"
                        value={values.description}
                        onChange={(e) => setField('description', e.target.value)}
                        placeholder="Optional description"
                        fullWidth
                        multiline
                        minRows={2}
                    />

                    <TextField
                        label="Priority"
                        type="number"
                        value={values.priority}
                        onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            setField('priority', Number.isNaN(val) ? 0 : Math.max(0, val));
                        }}
                        inputProps={{min: 0, step: 1}}
                        helperText="Lower numbers appear first. 0 is highest priority."
                        fullWidth
                    />

                    {/* Color Picker */}
                    <div className={'fc gap-1'}>
                        <Typography variant="body2" fontWeight={600}>
                            Color
                        </Typography>
                        <div className={'fr gap-1 flex-wrap'}>
                            {COLOR_PRESETS.map((color) => (
                                <Box
                                    key={color}
                                    onClick={() => setField('color', color)}
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 1.5,
                                        bgcolor: color,
                                        cursor: 'pointer',
                                        border: values.color === color ? '3px solid #0f172a' : '3px solid transparent',
                                        transition: 'transform 150ms ease, border-color 150ms ease',
                                        '&:hover': {
                                            transform: 'scale(1.1)'
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Icon Picker */}
                    <div className={'fc gap-1'}>
                        <Typography variant="body2" fontWeight={600}>
                            Icon <Typography component="span" color="error.main">*</Typography>
                            {selectedIconName && (
                                <Typography component="span" variant="caption" color="text.secondary">
                                    {' '}• {selectedIconName}
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
                                Loading icons...
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
                                    maxHeight: 140,
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
                                                    width: 44,
                                                    height: 44,
                                                    borderStyle: 'solid',
                                                    borderWidth: 2,
                                                    borderColor: isSelected
                                                        ? theme.palette.primary.main
                                                        : 'transparent',
                                                    backgroundColor: isSelected
                                                        ? 'rgba(244, 63, 94, 0.18)'
                                                        : 'rgba(15, 23, 42, 0.03)',
                                                    transition: 'all 200ms ease',
                                                    '&:hover': {
                                                        backgroundColor: 'rgba(244, 63, 94, 0.18)',
                                                        borderColor: theme.palette.primary.main
                                                    }
                                                })}
                                            >
                                                <Box
                                                    component="img"
                                                    src={getMediaUrl(icon.svg)}
                                                    alt={icon.name}
                                                    sx={{width: 22, height: 22}}
                                                />
                                            </IconButton>
                                        );
                                    })}
                                </div>
                            </Box>
                        )}
                    </div>
                </div>
            </DialogContent>

            <DialogActions sx={{px: 3, py: 2.5}}>
                <Button onClick={modal.closeModal} variant="outlined">
                    Cancel
                </Button>
                <Button
                    type="submit"
                    variant="contained"
                    disabled={saving || iconsLoading || icons.length === 0 || !values.iconId || !values.name.trim()}
                >
                    {saving ? 'Saving...' : isEditMode ? 'Save changes' : 'Create group'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default GroupForm;
