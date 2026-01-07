import React, {useCallback, useEffect, useState} from 'react';
import {Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from '@mui/material';
import type {ActionHistoryEntry} from '@shared/types';
import GlassTooltip from '../components/GlassTooltip';
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

    return (
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-8 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-semibold text-text-primary">History</h1>
                    <p className="text-sm text-text-secondary">
                        Recent executed actions with transcription and outputs.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary shadow-primary-sm">
                        {entries.length} entries
                    </div>
                    <GlassTooltip content="History is stored only on this device. Uninstalling the app removes it. You can also clear it here.">
                        <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary-200 bg-white text-text-secondary shadow-primary-sm transition-[background-color,border-color,color] duration-base hover:border-primary hover:bg-primary-50 hover:text-primary"
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
                        className="button-secondary rounded-xl px-4 py-2 text-sm font-semibold shadow-primary-sm"
                    >
                        {clearing ? 'Clearing...' : 'Clear history'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-1 items-center justify-center">
                    <div className="animate-pulse-soft text-primary">Loading history...</div>
                </div>
            ) : entries.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                    <div className="max-w-lg rounded-2xl border border-dashed border-primary-200 bg-bg-secondary p-8 text-center">
                        <h2 className="text-lg font-semibold text-text-primary">No history yet</h2>
                        <p className="mt-2 text-sm text-text-secondary">
                            Run an action from the microphone overlay to see it here.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 pb-6">
                    {entries.map((entry) => {
                        const prompt = entry.action_prompt?.trim();
                        const llmResponse = entry.llm_response?.trim();
                        return (
                            <section
                                key={entry.id}
                                className="card-animated rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6 animate-fade-in-up"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-[240px]">
                                        <p className="text-xs uppercase tracking-[0.22em] text-text-tertiary">Action</p>
                                        <h2 className="text-lg font-semibold text-text-primary">{entry.action_name}</h2>
                                        {prompt ? (
                                            <p className="mt-1 text-xs text-text-secondary">
                                                Prompt: {prompt}
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-xs text-text-tertiary">
                                                Prompt not used for this action.
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-xs text-text-tertiary">
                                        {formatTimestamp(entry.created_at)}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-xl border border-primary-100 bg-bg-secondary/60 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                                            Transcription
                                        </p>
                                        <div className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-sm text-text-primary">
                                            {entry.transcription}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-primary-100 bg-bg-secondary/60 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                                            LLM response
                                        </p>
                                        <div className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-sm text-text-primary">
                                            {llmResponse || 'No LLM output for this action.'}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-4 md:col-span-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">
                                            Executed result
                                        </p>
                                        <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-text-primary">
                                            {entry.result_text}
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
