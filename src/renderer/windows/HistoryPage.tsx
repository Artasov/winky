import React, {useCallback, useEffect, useState} from 'react';
import {Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from '@mui/material';
import type {ActionHistoryEntry} from '@shared/types';
import GlassTooltip from '../components/GlassTooltip';
import LoadingSpinner from '../components/LoadingSpinner';
import {useToast} from '../context/ToastContext';
import {historyBridge} from '../services/winkyBridge';
import type {HistoryUpdateEvent} from '../winkyBridge/historyBridge';

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

const HistoryPage: React.FC = () => {
    const {showToast} = useToast();
    const [entries, setEntries] = useState<ActionHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [openEntryId, setOpenEntryId] = useState<string | null>(null);

    const loadHistory = useCallback(async () => {
        setLoading(true);
        try {
            const nextEntries = await historyBridge.get();
            setEntries(nextEntries);
        } catch (error) {
            console.error('[HistoryPage] Failed to load history', error);
            showToast('Failed to load history.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        let active = true;
        const init = async () => {
            await loadHistory();
        };
        void init();

        const unsubscribe = historyBridge.subscribe((event: HistoryUpdateEvent) => {
            if (!active) {
                return;
            }
            if (event.type === 'cleared') {
                setEntries([]);
                return;
            }
            if (event.type === 'added') {
                setEntries((prev) => {
                    if (prev.some((entry) => entry.id === event.entry.id)) {
                        return prev;
                    }
                    return [event.entry, ...prev];
                });
            }
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, [loadHistory]);

    const handleClearClick = useCallback(() => {
        if (entries.length === 0 || clearing) {
            return;
        }
        setConfirmClearOpen(true);
    }, [entries.length, clearing]);

    const handleConfirmClear = useCallback(async () => {
        setConfirmClearOpen(false);
        setClearing(true);
        try {
            await historyBridge.clear();
            setEntries([]);
            showToast('History cleared.', 'success');
        } catch (error) {
            console.error('[HistoryPage] Failed to clear history', error);
            showToast('Failed to clear history.', 'error');
        } finally {
            setClearing(false);
        }
    }, [showToast]);

    const handleCancelClear = useCallback(() => {
        setConfirmClearOpen(false);
    }, []);

    const handleToggleEntry = useCallback((entryId: string) => {
        setOpenEntryId((prev) => (prev === entryId ? null : entryId));
    }, []);

    return (
        <div className="mx-auto fc h-full w-full max-w-5xl gap-3 px-8 py-6">
            <div className="frbc flex-wrap gap-3">
                <div className="fc gap-1 w-full">
                    <div className={'frbc w-full'}>
                        <h1 className="text-3xl font-semibold text-text-primary">History</h1>
                        <div className="frsc flex-wrap gap-3">
                            <div
                                className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary shadow-primary-sm">
                                {entries.length} entries
                            </div>
                            <GlassTooltip
                                content="History is stored only on this device. Uninstalling the app removes it. You can also clear it here.">
                                <button
                                    type="button"
                                    className="frcc h-7 w-7 rounded-xl border border-primary-200 bg-white text-text-secondary shadow-primary-sm transition-[background-color,border-color,color] duration-base hover:border-primary hover:bg-primary-50 hover:text-primary"
                                    aria-label="History storage info"
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
                            <button
                                type="button"
                                onClick={handleClearClick}
                                disabled={clearing || entries.length === 0}
                                className="button-secondary rounded-xl px-3 py-1 text-sm font-semibold shadow-primary-sm"
                            >
                                {clearing ? 'Clearing...' : 'Clear history'}
                            </button>
                        </div>
                    </div>

                    <p className="text-sm text-text-secondary">
                        Recent executed actions with transcription and outputs.
                    </p>
                </div>

            </div>

            {loading ? (
                <div className="flex flex-1 items-center justify-center">
                    <LoadingSpinner size="medium"/>
                </div>
            ) : entries.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                    <div
                        className="max-w-lg rounded-2xl border border-dashed border-primary-200 bg-bg-secondary p-8 text-center">
                        <h2 className="text-lg font-semibold text-text-primary">No history yet</h2>
                        <p className="mt-2 text-sm text-text-secondary">
                            Run an action from the microphone overlay to see it here.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-2 pb-6">
                    {entries.map((entry) => {
                        const llmResponse = entry.llm_response?.trim();
                        const isOpen = openEntryId === entry.id;
                        const transcriptionPreview = entry.transcription?.trim().slice(0, 100) ?? '';
                        return (
                            <section
                                key={entry.id}
                                onClick={() => handleToggleEntry(entry.id)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        handleToggleEntry(entry.id);
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-expanded={isOpen}
                                className="cursor-pointer rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-4 animate-fade-in-up"
                            >
                                <div className="frb flex-wrap gap-1 w-full">
                                    <div className="fc gap-1 w-full">
                                        <div className="frbc w-full gap-2">
                                            <div className="frsc gap-1">
                                                <h2 className="text-lg font-semibold text-text-primary">{entry.action_name}</h2>
                                                <span
                                                    className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">
                                                Action
                                            </span>
                                            </div>
                                            <div className="text-xs text-text-tertiary">
                                                <div className="flex items-center gap-2">
                                                    <span>{formatTimestamp(entry.created_at)}</span>
                                                    <button
                                                        type="button"
                                                        aria-label={isOpen ? 'Collapse entry' : 'Expand entry'}
                                                        aria-expanded={isOpen}
                                                        className="flex h-6 w-6 items-center justify-center rounded-md text-text-secondary transition-[transform,background-color,color] duration-base hover:bg-primary-50 hover:text-primary"
                                                    >
                                                        <svg
                                                            className={`h-3.5 w-3.5 transition-transform duration-base ${isOpen ? 'rotate-180' : ''}`}
                                                            viewBox="0 0 20 20"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth={2}
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <polyline points="5 8 10 13 15 8"/>
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {transcriptionPreview && (
                                            <p className="text-xs text-text-tertiary/80">
                                                {transcriptionPreview}
                                                {entry.transcription.length > 100 ? '...' : ''}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div
                                    className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'mt-3 max-h-[900px] opacity-100' : 'max-h-0 opacity-0'}`}
                                >
                                    <div className="flex flex-col gap-2">
                                        <div className="rounded-xl border border-primary-100 bg-bg-secondary/60 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                                                Transcription
                                            </p>
                                            <div
                                                className="mt-2 max-h-[400px] overflow-auto whitespace-pre-wrap text-sm text-text-primary history-scrollbar">
                                                {entry.transcription}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-primary-100 bg-bg-secondary/60 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                                                LLM response
                                            </p>
                                            <div
                                                className="mt-2 max-h-[400px] overflow-auto whitespace-pre-wrap text-sm text-text-primary history-scrollbar">
                                                {llmResponse || 'No LLM output for this action.'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}

            <Dialog
                open={confirmClearOpen}
                onClose={handleCancelClear}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Clear history?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Do you really want to clear all history? This cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancelClear} color="inherit">
                        Cancel
                    </Button>
                    <Button onClick={handleConfirmClear} color="error" variant="contained">
                        Clear
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default HistoryPage;
