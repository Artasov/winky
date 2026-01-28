import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from '@mui/material';
import {alpha, useTheme} from '@mui/material/styles';
import type {ActionHistoryEntry} from '@shared/types';
import GlassTooltip from '../components/GlassTooltip';
import LoadingSpinner from '../components/LoadingSpinner';
import AudioWavePlayer from '../components/AudioWavePlayer';
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

const resolveMimeType = (audioPath: string): string => {
    const normalized = audioPath.toLowerCase();
    if (normalized.endsWith('.wav')) {
        return 'audio/wav';
    }
    if (normalized.endsWith('.ogg')) {
        return 'audio/ogg';
    }
    if (normalized.endsWith('.mp3')) {
        return 'audio/mpeg';
    }
    if (normalized.endsWith('.flac')) {
        return 'audio/flac';
    }
    if (normalized.endsWith('.aac')) {
        return 'audio/aac';
    }
    if (normalized.endsWith('.webm')) {
        return 'audio/webm';
    }
    return 'audio/webm';
};

const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
    const start = data.byteOffset;
    const sliced = data.buffer.slice(start, start + data.byteLength);
    if (sliced instanceof SharedArrayBuffer) {
        const arrayBuffer = new ArrayBuffer(sliced.byteLength);
        new Uint8Array(arrayBuffer).set(new Uint8Array(sliced));
        return arrayBuffer;
    }
    return sliced;
};

const ensureUint8Array = (data: Uint8Array): Uint8Array<ArrayBuffer> => {
    const arrayBuffer = new ArrayBuffer(data.byteLength);
    const result = new Uint8Array(arrayBuffer);
    result.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return result;
};

const writeString = (view: DataView, offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
    }
};

const encodeWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let frame = 0; frame < numFrames; frame += 1) {
        for (let channel = 0; channel < numChannels; channel += 1) {
            const sample = buffer.getChannelData(channel)[frame] ?? 0;
            const clamped = Math.max(-1, Math.min(1, sample));
            const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
            view.setInt16(offset, int16, true);
            offset += bytesPerSample;
        }
    }

    return arrayBuffer;
};

const resolveAudioContext = () => {
    const AudioContextCtor = (window as typeof window & {webkitAudioContext?: typeof AudioContext}).AudioContext
        ?? (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!AudioContextCtor) {
        return null;
    }
    return new AudioContextCtor();
};

const buildWaveformPeaks = (buffer: AudioBuffer, bars: number): number[] => {
    const channelData = buffer.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channelData.length / bars));
    const peaks = new Array(bars).fill(0);
    for (let i = 0; i < bars; i += 1) {
        const start = i * samplesPerBar;
        const end = Math.min(channelData.length, start + samplesPerBar);
        let max = 0;
        for (let j = start; j < end; j += 1) {
            const value = Math.abs(channelData[j]);
            if (value > max) {
                max = value;
            }
        }
        peaks[i] = max;
    }
    const maxPeak = Math.max(...peaks, 0.0001);
    return peaks.map((value) => value / maxPeak);
};

const PAGE_SIZE = 50;
const WINDOW_STEP = PAGE_SIZE;
const MAX_PAGES = 3;
const MAX_WINDOW = PAGE_SIZE * MAX_PAGES;
const EDGE_THRESHOLD_PX = 120;
const SHIFT_COOLDOWN_MS = 200;

const HistoryPage: React.FC = () => {
    const {showToast} = useToast();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const darkSurface = alpha('#6f6f6f', 0.12);
    const darkSurfaceSoft = alpha('#6f6f6f', 0.1);
    const [entries, setEntries] = useState<ActionHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [clearing, setClearing] = useState(false);
    const [confirmClearOpen, setConfirmClearOpen] = useState(false);
    const [openEntryId, setOpenEntryId] = useState<string | null>(null);
    const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
    const [waveDurations, setWaveDurations] = useState<Record<string, number>>({});
    const [waveformLoading, setWaveformLoading] = useState<Record<string, boolean>>({});
    const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
    const [audioLoading, setAudioLoading] = useState<Record<string, boolean>>({});
    const [audioErrors, setAudioErrors] = useState<Record<string, string>>({});
    const [range, setRange] = useState({start: 0, end: 0});
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
    const rangeRef = useRef({start: 0, end: 0});
    const lastShiftRef = useRef(0);
    const pendingScrollRef = useRef<{index: number; offset: number} | null>(null);
    const audioUrlsRef = useRef<Record<string, string>>({});
    const audioInFlightRef = useRef<Record<string, boolean>>({});
    const waveformInFlightRef = useRef<Record<string, boolean>>({});
    const audioTimeoutRef = useRef<Record<string, number>>({});

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

    useEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        let node: HTMLElement | null = root;
        while (node) {
            const styles = window.getComputedStyle(node);
            if (styles.overflowY === 'auto' || styles.overflowY === 'scroll') {
                setScrollContainer(node);
                return;
            }
            node = node.parentElement;
        }
        setScrollContainer(root);
    }, []);

    const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

    const getAnchor = useCallback(() => {
        const container = scrollContainer;
        const list = listRef.current;
        if (!container || !list) {
            return null;
        }
        const containerRect = container.getBoundingClientRect();
        const items = list.querySelectorAll<HTMLElement>('[data-history-index]');
        for (const item of items) {
            const rect = item.getBoundingClientRect();
            if (rect.bottom > containerRect.top + 1) {
                const indexValue = item.dataset.historyIndex;
                if (!indexValue) {
                    continue;
                }
                const index = Number.parseInt(indexValue, 10);
                if (!Number.isFinite(index)) {
                    continue;
                }
                return {index, offset: rect.top - containerRect.top};
            }
        }
        return null;
    }, [scrollContainer]);

    useEffect(() => {
        setRange((prev) => {
            if (entries.length === 0) {
                rangeRef.current = {start: 0, end: 0};
                return {start: 0, end: 0};
            }
            if (prev.end === 0) {
                const next = {start: 0, end: Math.min(entries.length, PAGE_SIZE)};
                rangeRef.current = next;
                return next;
            }
            const maxWindow = Math.min(entries.length, MAX_WINDOW);
            const currentSize = Math.max(1, prev.end - prev.start);
            const targetSize = Math.min(currentSize, maxWindow);
            let start = Math.min(prev.start, Math.max(0, entries.length - targetSize));
            let end = Math.min(entries.length, start + targetSize);
            if (end - start < targetSize) {
                start = Math.max(0, end - targetSize);
            }
            if (start === prev.start && end === prev.end) {
                return prev;
            }
            const next = {start, end};
            rangeRef.current = next;
            return next;
        });
    }, [entries.length]);

    useEffect(() => {
        rangeRef.current = range;
    }, [range]);

    const shiftWindow = useCallback((direction: 'up' | 'down') => {
        const now = Date.now();
        if (now - lastShiftRef.current < SHIFT_COOLDOWN_MS) {
            return;
        }
        const prev = rangeRef.current;
        const anchor = getAnchor();
        const maxWindow = Math.min(entries.length, MAX_WINDOW);
        const currentSize = Math.max(1, prev.end - prev.start);
        const canExpand = currentSize < maxWindow;
        if (direction === 'down') {
            if (prev.end >= entries.length) {
                return;
            }
            let nextStart = prev.start;
            let nextEnd = prev.end;
            if (canExpand) {
                nextEnd = Math.min(entries.length, prev.end + WINDOW_STEP);
            } else {
                nextStart = Math.min(prev.start + WINDOW_STEP, Math.max(0, entries.length - maxWindow));
                nextEnd = Math.min(entries.length, nextStart + maxWindow);
            }
            if (nextStart === prev.start && nextEnd === prev.end) {
                return;
            }
            lastShiftRef.current = now;
            if (anchor) {
                pendingScrollRef.current = anchor;
            }
            const next = {start: nextStart, end: nextEnd};
            rangeRef.current = next;
            setRange(next);
            return;
        }
        if (prev.start <= 0) {
            return;
        }
        let nextStart = prev.start;
        let nextEnd = prev.end;
        if (canExpand) {
            nextStart = Math.max(0, prev.start - WINDOW_STEP);
        } else {
            nextStart = Math.max(0, prev.start - WINDOW_STEP);
            nextEnd = Math.min(entries.length, nextStart + maxWindow);
        }
        if (nextStart === prev.start && nextEnd === prev.end) {
            return;
        }
        lastShiftRef.current = now;
        if (anchor) {
            pendingScrollRef.current = anchor;
        }
        const next = {start: nextStart, end: nextEnd};
        rangeRef.current = next;
        setRange(next);
    }, [entries.length, getAnchor]);

    useEffect(() => {
        if (!scrollContainer) {
            return;
        }
        const getEdgeState = () => {
            const {scrollTop, scrollHeight, clientHeight} = scrollContainer;
            const atTop = scrollTop <= EDGE_THRESHOLD_PX;
            const atBottom = scrollTop + clientHeight >= scrollHeight - EDGE_THRESHOLD_PX;
            return {atTop, atBottom};
        };
        const handleScroll = () => {
            const {atTop, atBottom} = getEdgeState();
            if (atBottom) {
                shiftWindow('down');
            } else if (atTop) {
                shiftWindow('up');
            }
        };
        const handleWheel = (event: WheelEvent) => {
            const {atTop, atBottom} = getEdgeState();
            if (event.deltaY > 0 && atBottom) {
                shiftWindow('down');
            } else if (event.deltaY < 0 && atTop) {
                shiftWindow('up');
            }
        };
        scrollContainer.addEventListener('scroll', handleScroll, {passive: true});
        scrollContainer.addEventListener('wheel', handleWheel, {passive: true});
        return () => {
            scrollContainer.removeEventListener('scroll', handleScroll);
            scrollContainer.removeEventListener('wheel', handleWheel);
        };
    }, [scrollContainer, shiftWindow]);

    useLayoutEffect(() => {
        const pending = pendingScrollRef.current;
        if (!pending || !scrollContainer || !listRef.current) {
            return;
        }
        pendingScrollRef.current = null;
        const anchorElement = listRef.current.querySelector<HTMLElement>(
            `[data-history-index="${pending.index}"]`
        );
        if (!anchorElement) {
            return;
        }
        const containerRect = scrollContainer.getBoundingClientRect();
        const rect = anchorElement.getBoundingClientRect();
        const offset = rect.top - containerRect.top;
        const delta = offset - pending.offset;
        if (Math.abs(delta) > 1) {
            scrollContainer.scrollTop += delta;
        }
    }, [range, scrollContainer]);

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
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            return;
        }
        setOpenEntryId((prev) => (prev === entryId ? null : entryId));
    }, []);

    const handleRetryAudio = useCallback((entryId: string) => {
        setAudioErrors((prev) => {
            if (!prev[entryId]) {
                return prev;
            }
            const next = {...prev};
            delete next[entryId];
            return next;
        });
        setAudioUrls((prev) => {
            const existing = prev[entryId];
            if (!existing) {
                return prev;
            }
            URL.revokeObjectURL(existing);
            const next = {...prev};
            delete next[entryId];
            return next;
        });
        setWaveforms((prev) => {
            if (!prev[entryId]) {
                return prev;
            }
            const next = {...prev};
            delete next[entryId];
            return next;
        });
        setWaveDurations((prev) => {
            if (!prev[entryId]) {
                return prev;
            }
            const next = {...prev};
            delete next[entryId];
            return next;
        });
        const timeoutHandle = audioTimeoutRef.current[entryId];
        if (timeoutHandle) {
            window.clearTimeout(timeoutHandle);
            delete audioTimeoutRef.current[entryId];
        }
        delete audioInFlightRef.current[entryId];
        delete waveformInFlightRef.current[entryId];
    }, []);

    const loadWaveform = useCallback(async (
        audioData: Uint8Array
    ): Promise<{peaks: number[]; duration: number; wavData: ArrayBuffer} | null> => {
        const audioContext = resolveAudioContext();
        if (!audioContext) {
            return null;
        }
        try {
            const arrayBuffer = toArrayBuffer(audioData);
            const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            return {
                peaks: buildWaveformPeaks(decoded, 48),
                duration: decoded.duration || 0,
                wavData: encodeWav(decoded)
            };
        } finally {
            audioContext.close().catch(() => {});
        }
    }, []);

    useEffect(() => {
        if (!openEntryId) {
            return;
        }
        const entryId = openEntryId;
        const entry = entriesById.get(openEntryId);
        const audioPath = entry?.audio_path?.trim();
        if (!audioPath) {
            return;
        }
        if (audioUrls[openEntryId] || audioErrors[openEntryId] || audioInFlightRef.current[entryId]) {
            return;
        }
        audioInFlightRef.current[entryId] = true;
        setAudioLoading((prev) => ({...prev, [entryId]: true}));

        const timeoutMs = 8000;
        const timeoutId = window.setTimeout(() => {
            if (!audioInFlightRef.current[entryId]) {
                return;
            }
            audioInFlightRef.current[entryId] = false;
            setAudioErrors((prev) => ({...prev, [entryId]: 'Audio unavailable.'}));
            setAudioLoading((prev) => ({...prev, [entryId]: false}));
        }, timeoutMs);
        audioTimeoutRef.current[entryId] = timeoutId;

        historyBridge.readAudio(audioPath)
            .then((audioData) => {
                if (!audioInFlightRef.current[entryId]) {
                    return;
                }
                audioInFlightRef.current[entryId] = false;
                const timeoutHandle = audioTimeoutRef.current[entryId];
                if (timeoutHandle) {
                    window.clearTimeout(timeoutHandle);
                    delete audioTimeoutRef.current[entryId];
                }

                const typedData = audioData instanceof Uint8Array ? audioData : new Uint8Array(audioData);

                if (!waveforms[entryId] && !waveformInFlightRef.current[entryId]) {
                    waveformInFlightRef.current[entryId] = true;
                    setWaveformLoading((prev) => ({...prev, [entryId]: true}));
                    loadWaveform(typedData)
                        .then((result) => {
                            if (result) {
                                const wavBlob = new Blob([result.wavData], {type: 'audio/wav'});
                                const wavUrl = URL.createObjectURL(wavBlob);
                                setWaveforms((prev) => ({...prev, [entryId]: result.peaks}));
                                setWaveDurations((prev) => ({...prev, [entryId]: result.duration}));
                                setAudioUrls((prev) => ({...prev, [entryId]: wavUrl}));
                            } else {
                                const fallbackBlob = new Blob([ensureUint8Array(typedData)], {type: resolveMimeType(audioPath)});
                                const fallbackUrl = URL.createObjectURL(fallbackBlob);
                                setAudioUrls((prev) => ({...prev, [entryId]: fallbackUrl}));
                            }
                        })
                        .catch((error) => {
                            console.warn('[HistoryPage] Failed to build waveform', error);
                            const fallbackBlob = new Blob([ensureUint8Array(typedData)], {type: resolveMimeType(audioPath)});
                            const fallbackUrl = URL.createObjectURL(fallbackBlob);
                            setAudioUrls((prev) => ({...prev, [entryId]: fallbackUrl}));
                        })
                        .finally(() => {
                            waveformInFlightRef.current[entryId] = false;
                            setWaveformLoading((prev) => ({...prev, [entryId]: false}));
                            setAudioErrors((prev) => {
                                if (!prev[entryId]) {
                                    return prev;
                                }
                                const next = {...prev};
                                delete next[entryId];
                                return next;
                            });
                            setAudioLoading((prev) => ({...prev, [entryId]: false}));
                        });
                } else {
                    const fallbackBlob = new Blob([ensureUint8Array(typedData)], {type: resolveMimeType(audioPath)});
                    const fallbackUrl = URL.createObjectURL(fallbackBlob);
                    setAudioUrls((prev) => ({...prev, [entryId]: fallbackUrl}));
                    setAudioLoading((prev) => ({...prev, [entryId]: false}));
                    setAudioErrors((prev) => {
                        if (!prev[entryId]) {
                            return prev;
                        }
                        const next = {...prev};
                        delete next[entryId];
                        return next;
                    });
                }
            })
            .catch((error) => {
                if (!audioInFlightRef.current[entryId]) {
                    return;
                }
                audioInFlightRef.current[entryId] = false;
                const timeoutHandle = audioTimeoutRef.current[entryId];
                if (timeoutHandle) {
                    window.clearTimeout(timeoutHandle);
                    delete audioTimeoutRef.current[entryId];
                }
                console.warn('[HistoryPage] Failed to load audio', error);
                setAudioErrors((prev) => ({...prev, [entryId]: 'Audio unavailable.'}));
                setAudioLoading((prev) => ({...prev, [entryId]: false}));
            });
    }, [entriesById, loadWaveform, openEntryId, audioUrls, audioErrors, waveforms]);

    useEffect(() => {
        audioUrlsRef.current = audioUrls;
    }, [audioUrls]);

    useEffect(() => {
        return () => {
            Object.values(audioUrlsRef.current).forEach((url) => {
                URL.revokeObjectURL(url);
            });
        };
    }, []);

    useEffect(() => {
        const entryIds = new Set(entries.map((entry) => entry.id));
        setAudioUrls((prev) => {
            let changed = false;
            const next: Record<string, string> = {};
            for (const [id, url] of Object.entries(prev)) {
                if (entryIds.has(id)) {
                    next[id] = url;
                } else {
                    URL.revokeObjectURL(url);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        setWaveforms((prev) => {
            let changed = false;
            const next: Record<string, number[]> = {};
            for (const [id, peaks] of Object.entries(prev)) {
                if (entryIds.has(id)) {
                    next[id] = peaks;
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        setWaveDurations((prev) => {
            let changed = false;
            const next: Record<string, number> = {};
            for (const [id, duration] of Object.entries(prev)) {
                if (entryIds.has(id)) {
                    next[id] = duration;
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        setAudioErrors((prev) => {
            let changed = false;
            const next: Record<string, string> = {};
            for (const [id, error] of Object.entries(prev)) {
                if (entryIds.has(id)) {
                    next[id] = error;
                } else {
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        for (const [id, timeoutId] of Object.entries(audioTimeoutRef.current)) {
            if (!entryIds.has(id)) {
                window.clearTimeout(timeoutId);
                delete audioTimeoutRef.current[id];
                delete audioInFlightRef.current[id];
                delete waveformInFlightRef.current[id];
            }
        }
    }, [entries]);

    const visibleEntries = useMemo(
        () => entries.slice(range.start, range.end),
        [entries, range.end, range.start]
    );
    return (
        <div
            ref={rootRef}
            className="mx-auto fc h-full w-full max-w-5xl gap-3 px-8 py-6 overflow-x-hidden box-border"
        >
            <div className="frbc flex-wrap gap-3">
                <div className="fc gap-1 w-full">
                    <div className={'frbc w-full'}>
                        <h1 className="text-3xl font-semibold text-text-primary">History</h1>
                        <div className="frsc flex-wrap gap-3">
                            <div
                                className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary shadow-primary-sm"
                                style={isDark ? {
                                    backgroundColor: darkSurfaceSoft,
                                    border: `1px solid ${darkSurface}`,
                                    color: theme.palette.text.primary
                                } : undefined}
                            >
                                {entries.length} entries
                            </div>
                            <GlassTooltip
                                content="History is stored only on this device. Uninstalling the app removes it. You can also clear it here.">
                                <button
                                    type="button"
                                    className="frcc h-7 w-7 rounded-xl border border-primary-200 bg-bg-elevated text-text-secondary shadow-primary-sm transition-[background-color,border-color,color] duration-base hover:border-primary hover:bg-primary-50 hover:text-primary"
                                    aria-label="History storage info"
                                    style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurfaceSoft} : undefined}
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
                        className="max-w-lg rounded-2xl border border-dashed border-primary-200 bg-bg-secondary p-8 text-center"
                        style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurface} : undefined}
                    >
                        <h2 className="text-lg font-semibold text-text-primary">No history yet</h2>
                        <p className="mt-2 text-sm text-text-secondary">
                            Run an action from the microphone overlay to see it here.
                        </p>
                    </div>
                </div>
            ) : (
                <div
                    ref={listRef}
                    className="w-full max-w-full min-w-0 box-border pb-6 flex flex-col gap-2"
                >
                    {visibleEntries.map((entry, index) => {
                        const llmResponse = entry.llm_response?.trim();
                        const isOpen = openEntryId === entry.id;
                        const transcriptionPreview = entry.transcription?.trim().slice(0, 100) ?? '';
                        const globalIndex = range.start + index;
                        return (
                            <section
                                key={entry.id}
                                data-history-index={globalIndex}
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
                                className="cursor-pointer rounded-2xl border border-primary-200 bg-bg-elevated shadow-primary-sm p-4 animate-fade-in-up max-w-full w-full box-border min-w-0 overflow-hidden"
                                style={{
                                    maxWidth: '100%',
                                    borderColor: isDark ? darkSurface : undefined,
                                    backgroundColor: isDark ? darkSurface : undefined,
                                    boxShadow: isDark ? 'none' : undefined
                                }}
                            >
                                <div className="frb flex-wrap gap-1 w-full min-w-0">
                                    <div className="fc gap-1 w-full min-w-0">
                                        <div className="frbc w-full gap-2 min-w-0 flex-wrap">
                                            <div className="frsc gap-1 min-w-0 flex-1 flex-wrap">
                                                <h2 className="text-lg font-semibold text-text-primary min-w-0 break-words break-all flex-1">
                                                    {entry.action_name}
                                                </h2>
                                                <span
                                                    className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary shrink-0"
                                                    style={isDark ? {
                                                        backgroundColor: darkSurfaceSoft,
                                                        border: `1px solid ${darkSurface}`,
                                                        color: theme.palette.text.primary
                                                    } : undefined}
                                                >
                                                    Action
                                                </span>
                                            </div>
                                            <div className="text-xs text-text-tertiary min-w-0">
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
                                            <p className="text-xs text-text-tertiary/80 break-words break-all">
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
                                        <div
                                            className="rounded-xl border border-primary-100 bg-bg-secondary/60 p-3"
                                            style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurface} : undefined}
                                        >
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                                                Request
                                            </p>
                                            <div
                                                className="mt-2 max-h-[400px] overflow-auto whitespace-pre-wrap break-words break-all text-sm text-text-primary history-scrollbar">
                                                {entry.transcription}
                                            </div>
                                        </div>

                                        <div
                                            className="rounded-xl border border-primary-100 bg-bg-secondary/60 p-3"
                                            style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurface} : undefined}
                                        >
                                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                                                Response
                                            </p>
                                            <div
                                                className="mt-2 max-h-[400px] overflow-auto whitespace-pre-wrap break-words break-all text-sm text-text-primary history-scrollbar">
                                                {llmResponse || 'No LLM output for this action.'}
                                            </div>
                                        </div>

                                        {entry.audio_path && (
                                            <div
                                                className="rounded-xl border border-primary-100 bg-bg-secondary/60 p-3"
                                                onClick={(event) => event.stopPropagation()}
                                                style={isDark ? {borderColor: darkSurface, backgroundColor: darkSurface} : undefined}
                                            >
                                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">
                                                    Audio
                                                </p>
                                                <AudioWavePlayer
                                                    audioUrl={audioUrls[entry.id]}
                                                    waveform={waveforms[entry.id]}
                                                    durationOverride={waveDurations[entry.id]}
                                                    loading={audioLoading[entry.id]}
                                                    waveformLoading={waveformLoading[entry.id]}
                                                    error={audioErrors[entry.id]}
                                                    onRetry={() => handleRetryAudio(entry.id)}
                                                />
                                            </div>
                                        )}
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
