import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
    Button,
    Checkbox,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Pagination,
    Stack,
    Switch,
    TextField
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import {alpha, useTheme} from '@mui/material/styles';
import type {WinkyNote} from '@shared/types';
import {useConfig} from '../context/ConfigContext';
import {useToast} from '../context/ToastContext';
import GlassTooltip from '../components/GlassTooltip';
import LoadingSpinner from '../components/LoadingSpinner';
import {
    bulkDeleteNotesForMode,
    createNoteForMode,
    deleteNoteForMode,
    fetchNotes,
    resolveNotesStorageMode,
    updateNoteForMode,
    type NotesPage,
    type NotesStorageMode
} from '../services/notesService';
import {subscribeNotesEvent} from '../services/notesEvents';

const PAGE_SIZE = 20;

const formatTimestamp = (value: string): string => {
    if (!value) {
        return '';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleString();
};

const NotesPage: React.FC = () => {
    const {config, updateConfig} = useConfig();
    const {showToast} = useToast();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.12);
    const resolvedMode = resolveNotesStorageMode(config);
    const [storageMode, setStorageMode] = useState<NotesStorageMode>(resolvedMode);
    const [page, setPage] = useState(1);
    const [data, setData] = useState<NotesPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingNote, setEditingNote] = useState<WinkyNote | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editXUsername, setEditXUsername] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [createTitle, setCreateTitle] = useState('');
    const [createDescription, setCreateDescription] = useState('');
    const [createXUsername, setCreateXUsername] = useState('');
    const [pendingDelete, setPendingDelete] = useState<WinkyNote | null>(null);
    const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const selectionActive = selectedIds.size > 0;

    const totalPages = useMemo(() => {
        if (!data) {
            return 1;
        }
        return Math.max(1, Math.ceil(data.count / PAGE_SIZE));
    }, [data]);

    const loadNotes = useCallback(async (mode: NotesStorageMode, targetPage: number) => {
        setLoading(true);
        try {
            const nextData = await fetchNotes(mode, targetPage, PAGE_SIZE);
            const nextTotalPages = Math.max(1, Math.ceil(nextData.count / PAGE_SIZE));
            if (targetPage > nextTotalPages) {
                setPage(nextTotalPages);
                return;
            }
            setData(nextData);
        } catch (error) {
            console.error('[NotesPage] Failed to load notes', error);
            showToast('Failed to load notes.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        setStorageMode(resolvedMode);
        setPage(1);
    }, [resolvedMode]);

    useEffect(() => {
        void loadNotes(storageMode, page);
    }, [loadNotes, page, storageMode]);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [page, storageMode]);

    useEffect(() => {
        const unsubscribe = subscribeNotesEvent((event) => {
            const eventMode = event.mode ?? 'local';
            if (eventMode !== storageMode) {
                return;
            }
            if (event.type === 'added' && page !== 1) {
                setPage(1);
                return;
            }
            void loadNotes(storageMode, page);
        });
        return () => {
            unsubscribe();
        };
    }, [loadNotes, page, storageMode]);

    const handleModeToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextMode: NotesStorageMode = event.target.checked ? 'api' : 'local';
        setStorageMode(nextMode);
        setPage(1);
        try {
            await updateConfig({notesStorageMode: nextMode});
        } catch (error) {
            console.error('[NotesPage] Failed to update notes mode', error);
            showToast('Failed to update notes storage mode.', 'error');
            setStorageMode(resolvedMode);
        }
    };

    const handleEditOpen = (note: WinkyNote) => {
        setEditingNote(note);
        setEditTitle(note.title);
        setEditDescription(note.description ?? '');
        setEditXUsername(note.x_username ?? '');
    };

    const handleEditClose = () => {
        setEditingNote(null);
        setEditTitle('');
        setEditDescription('');
        setEditXUsername('');
    };

    const handleCreateOpen = () => {
        setCreateOpen(true);
    };

    const handleCreateClose = () => {
        setCreateOpen(false);
        setCreateTitle('');
        setCreateDescription('');
        setCreateXUsername('');
    };

    const handleCreateSave = async () => {
        const trimmedTitle = createTitle.trim();
        if (!trimmedTitle) {
            showToast('Title cannot be empty.', 'error');
            return;
        }
        setSaving(true);
        try {
            await createNoteForMode(storageMode, {
                title: trimmedTitle,
                description: createDescription,
                x_username: createXUsername.trim()
            });
            showToast('Note created.', 'success');
            handleCreateClose();
            if (page !== 1) {
                setPage(1);
                return;
            }
            await loadNotes(storageMode, page);
        } catch (error) {
            console.error('[NotesPage] Failed to create note', error);
            showToast('Failed to create note.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleEditSave = async () => {
        if (!editingNote) {
            return;
        }
        const trimmedTitle = editTitle.trim();
        if (!trimmedTitle) {
            showToast('Title cannot be empty.', 'error');
            return;
        }
        setSaving(true);
        try {
            await updateNoteForMode(storageMode, editingNote.id, {
                title: trimmedTitle,
                description: editDescription,
                x_username: editXUsername.trim()
            });
            showToast('Note updated.', 'success');
            handleEditClose();
            await loadNotes(storageMode, page);
        } catch (error) {
            console.error('[NotesPage] Failed to update note', error);
            showToast('Failed to update note.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!pendingDelete) {
            return;
        }
        setSaving(true);
        try {
            await deleteNoteForMode(storageMode, pendingDelete.id);
            showToast('Note deleted.', 'success');
            setPendingDelete(null);
            handleEditClose();
            setSelectedIds((prev) => {
                if (!prev.has(pendingDelete.id)) {
                    return prev;
                }
                const next = new Set(prev);
                next.delete(pendingDelete.id);
                return next;
            });
            await loadNotes(storageMode, page);
        } catch (error) {
            console.error('[NotesPage] Failed to delete note', error);
            showToast('Failed to delete note.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleBulkDeleteConfirm = async () => {
        if (selectedIds.size === 0) {
            return;
        }
        const ids = Array.from(selectedIds);
        setSaving(true);
        try {
            const deletedCount = await bulkDeleteNotesForMode(storageMode, ids);
            showToast(`Deleted ${deletedCount} notes.`, 'success');
            setPendingBulkDelete(false);
            setSelectedIds(new Set());
            if (editingNote && ids.includes(editingNote.id)) {
                handleEditClose();
            }
            await loadNotes(storageMode, page);
        } catch (error) {
            console.error('[NotesPage] Failed to bulk delete notes', error);
            showToast('Failed to delete selected notes.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleCardActivate = (note: WinkyNote) => {
        if (selectionActive) {
            toggleSelection(note.id);
            return;
        }
        handleEditOpen(note);
    };

    const infoMessage = storageMode === 'local'
        ? 'Notes are stored only on this device. Uninstalling the app removes them.'
        : 'Notes are stored in your account and synced via the API.';

    return (
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-8 py-6 overflow-hidden">
            <div className="flex flex-col">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-3xl font-semibold text-text-primary">Notes</h1>
                        <p className="text-sm text-text-secondary">
                            Quick notes captured from your actions.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary shadow-primary-sm">
                            {data?.count ?? 0} notes
                        </div>
                        <div className="flex items-center gap-1 rounded-full bg-bg-secondary px-2 py-0.5 shadow-primary-sm">
                            <span className={storageMode === 'local' ? 'text-xs font-semibold text-primary' : 'text-xs text-text-tertiary'}>
                                Local
                            </span>
                            <Switch
                                checked={storageMode === 'api'}
                                onChange={handleModeToggle}
                                color="secondary"
                                size="small"
                                inputProps={{'aria-label': 'Toggle notes storage mode'}}
                                sx={{
                                    m: 0,
                                    p: 0,
                                    width: 36,
                                    height: 20,
                                    '& .MuiSwitch-switchBase': {
                                        p: '2px',
                                        '&.Mui-checked': {
                                            transform: 'translateX(16px)'
                                        }
                                    },
                                    '& .MuiSwitch-thumb': {
                                        width: 16,
                                        height: 16
                                    },
                                    '& .MuiSwitch-track': {
                                        borderRadius: '10px',
                                        opacity: '1 !important',
                                        backgroundColor: alpha(theme.palette.common.black, isDark ? 0.5 : 0.36)
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        opacity: '1 !important',
                                        backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.7 : 0.58)
                                    }
                                }}
                            />
                            <span className={storageMode === 'api' ? 'text-xs font-semibold text-primary' : 'text-xs text-text-tertiary'}>
                                API
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleCreateOpen}
                            className="frcc h-8 w-8 rounded-lg bg-bg-elevated text-text-secondary shadow-primary-sm transition-[background-color,color] duration-base hover:bg-primary-50 hover:text-primary"
                            aria-label="Create note"
                        >
                            <AddRoundedIcon sx={{fontSize: 20}}/>
                        </button>
                        <GlassTooltip content={infoMessage} contentClassName="px-2 py-1">
                            <button
                                type="button"
                                className="frcc h-8 w-8 rounded-lg bg-bg-elevated text-text-secondary shadow-primary-sm transition-[background-color,color] duration-base hover:bg-primary-50 hover:text-primary"
                                aria-label="Notes storage info"
                            >
                                <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="16" x2="12" y2="12"/>
                                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                                </svg>
                            </button>
                        </GlassTooltip>
                    </div>
                </div>

                <Collapse in={selectionActive} timeout={320} collapsedSize={0}>
                    <div className="pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-bg-elevated px-4 py-3 shadow-primary-sm">
                            <div className="text-sm font-semibold text-text-primary">
                                Selected: {selectedIds.size}
                            </div>
                            <Button
                                color="error"
                                variant="contained"
                                onClick={() => setPendingBulkDelete(true)}
                                disabled={saving}
                            >
                                Delete selected
                            </Button>
                        </div>
                    </div>
                </Collapse>
            </div>

            <div className="flex-1 mt-2 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2">
                    {loading ? (
                        <div className="flex min-h-[240px] items-center justify-center">
                            <LoadingSpinner size="medium"/>
                        </div>
                    ) : (data?.results.length ?? 0) === 0 ? (
                        <div className="flex min-h-[240px] items-center justify-center">
                            <div
                                className="max-w-lg rounded-2xl border border-dashed border-primary-200 bg-bg-secondary p-8 text-center"
                                style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurface} : undefined}
                            >
                                <h2 className="text-lg font-semibold text-text-primary">No notes yet</h2>
                                <p className="mt-2 text-sm text-text-secondary">
                                    Use the Quick note action to capture your first entry.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-2 pb-6 pt-2">
                            {data?.results.map((note) => (
                                <section
                                    key={note.id}
                                    className="relative rounded-2xl border border-primary-200 shadow-primary-sm p-3 animate-fade-in-up cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleCardActivate(note)}
                                    onMouseEnter={() => setHoveredId(note.id)}
                                    onMouseLeave={() => setHoveredId((prev) => (prev === note.id ? null : prev))}
                                    style={{
                                        borderColor: isDark ? darkSurface : undefined,
                                        backgroundColor: isDark ? darkSurface : '#ffffff',
                                        boxShadow: isDark ? 'none' : undefined
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            handleCardActivate(note);
                                        }
                                    }}
                                >
                                    <div
                                        className={[
                                            'absolute right-3 top-3 z-10 transition-all duration-200 ease-out',
                                            selectionActive || hoveredId === note.id
                                                ? 'opacity-100 translate-y-0 pointer-events-auto'
                                                : 'opacity-0 -translate-y-1 pointer-events-none'
                                        ].join(' ')}
                                    >
                                        <Checkbox
                                            size="small"
                                            checked={selectedIds.has(note.id)}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={() => toggleSelection(note.id)}
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="min-w-[240px]">
                                            <h2 className="text-lg font-semibold text-text-primary">{note.title}</h2>
                                            <p className="mt-1 text-xs text-text-tertiary">
                                                {formatTimestamp(note.created_at)}
                                            </p>
                                            {note.x_username ? (
                                                <p className="mt-1 text-xs font-medium text-primary">
                                                    @{note.x_username}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    {/*<div className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap text-sm text-text-primary">*/}
                                    {/*    {note.description}*/}
                                    {/*</div>*/}
                                </section>
                            ))}
                        </div>
                    )}

                    {data && data.count > PAGE_SIZE ? (
                        <Stack alignItems="center" sx={{pb: 2}}>
                            <Pagination
                                page={page}
                                count={totalPages}
                                color="primary"
                                onChange={(_, nextPage) => setPage(nextPage)}
                            />
                        </Stack>
                    ) : null}
                </div>
            </div>

            <Dialog
                open={createOpen}
                onClose={handleCreateClose}
                maxWidth="sm"
                fullWidth
                slotProps={{
                    paper: {
                        sx: {border: 'none'}
                    }
                }}
            >
                <DialogTitle sx={{fontSize: 24, fontWeight: 700}}>New Note</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{pt: 1}}>
                        <TextField
                            label="Title"
                            value={createTitle}
                            onChange={(event) => setCreateTitle(event.target.value)}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Description"
                            value={createDescription}
                            onChange={(event) => setCreateDescription(event.target.value)}
                            fullWidth
                            multiline
                            minRows={5}
                        />
                        <TextField
                            label="X"
                            placeholder="X"
                            value={createXUsername}
                            onChange={(event) => setCreateXUsername(event.target.value)}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{px: 3, py: 2}}>
                    <Button onClick={handleCreateClose} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={handleCreateSave} variant="contained" disabled={saving}>
                        {saving ? 'Saving...' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(editingNote)} onClose={handleEditClose} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <div className="frsc gap-1">
                        <span className="text-xs uppercase tracking-[0.22em] text-text-tertiary">Note</span>
                        <span className="font-mono text-xs text-text-secondary">{editingNote?.id ?? ''}</span>
                    </div>
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{pt: 1}}>
                        <TextField
                            label="Title"
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Description"
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                            fullWidth
                            multiline
                            minRows={5}
                        />
                        <TextField
                            label="X"
                            placeholder="X"
                            value={editXUsername}
                            onChange={(event) => setEditXUsername(event.target.value)}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{px: 3, py: 2, justifyContent: 'space-between'}}>
                    <Button
                        onClick={() => {
                            if (editingNote) {
                                setPendingDelete(editingNote);
                            }
                        }}
                        color="error"
                        variant="outlined"
                    >
                        Delete
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button onClick={handleEditClose} color="inherit">
                            Cancel
                        </Button>
                        <Button onClick={handleEditSave} variant="contained" disabled={saving}>
                            {saving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Delete note?</DialogTitle>
                <DialogContent>
                    <p className="text-sm text-text-secondary">
                        {pendingDelete ? `Delete "${pendingDelete.title}"? This cannot be undone.` : ''}
                    </p>
                </DialogContent>
                <DialogActions sx={{px: 3, py: 2}}>
                    <Button onClick={() => setPendingDelete(null)} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={saving}>
                        {saving ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={pendingBulkDelete} onClose={() => setPendingBulkDelete(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Delete selected notes?</DialogTitle>
                <DialogContent>
                    <p className="text-sm text-text-secondary">
                        {selectedIds.size > 0
                            ? `Delete ${selectedIds.size} notes? This cannot be undone.`
                            : ''}
                    </p>
                </DialogContent>
                <DialogActions sx={{px: 3, py: 2}}>
                    <Button onClick={() => setPendingBulkDelete(false)} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={handleBulkDeleteConfirm} color="error" variant="contained" disabled={saving}>
                        {saving ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default NotesPage;
