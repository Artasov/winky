import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

const WAVE_MIN_HEIGHT = 3;
const WAVE_MAX_HEIGHT = 20;
const PLACEHOLDER_BARS = 48;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--:--';
    }
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

type AudioWavePlayerProps = {
    audioUrl?: string;
    waveform?: number[];
    loading?: boolean;
    waveformLoading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    durationOverride?: number;
};

const AudioWavePlayer: React.FC<AudioWavePlayerProps> = ({
    audioUrl,
    waveform = [],
    loading = false,
    waveformLoading = false,
    error,
    onRetry,
    durationOverride
}) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const placeholderBars = useMemo(() => new Array(PLACEHOLDER_BARS).fill(0.35), []);
    const bars = waveform.length > 0 ? waveform : placeholderBars;

    const stopRaf = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    const startRaf = useCallback(() => {
        const tick = () => {
            const audio = audioRef.current;
            if (!audio) {
                stopRaf();
                return;
            }
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                setDuration(audio.duration);
            }
            setCurrentTime(audio.currentTime || 0);
            if (!audio.paused && !audio.ended) {
                rafRef.current = requestAnimationFrame(tick);
            }
        };
        stopRaf();
        rafRef.current = requestAnimationFrame(tick);
    }, [stopRaf]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        const handlePlay = () => {
            setIsPlaying(true);
            startRaf();
        };
        const handlePause = () => {
            setIsPlaying(false);
            stopRaf();
        };
        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentTime(Number.isFinite(audio.duration) ? audio.duration : 0);
            stopRaf();
        };
        const handleLoaded = () => {
            setDuration((prev) => (Number.isFinite(audio.duration) ? audio.duration : prev));
            setCurrentTime(0);
        };
    const handleDurationChange = () => {
        setDuration((prev) => (Number.isFinite(audio.duration) ? audio.duration : prev));
    };
        const handleSeeked = () => {
            setCurrentTime(audio.currentTime);
        };
    const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
        setDuration((prev) => (prev > 0 || !Number.isFinite(audio.duration) ? prev : audio.duration));
    };

        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('loadedmetadata', handleLoaded);
        audio.addEventListener('durationchange', handleDurationChange);
        audio.addEventListener('seeked', handleSeeked);
        audio.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('loadedmetadata', handleLoaded);
            audio.removeEventListener('durationchange', handleDurationChange);
            audio.removeEventListener('seeked', handleSeeked);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            stopRaf();
        };
    }, [startRaf, stopRaf]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        audio.pause();
        try {
            audio.currentTime = 0;
        } catch {
            /* ignore */
        }
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        if (audioUrl) {
            audio.load();
        }
    }, [audioUrl]);

    useEffect(() => {
        if (!audioUrl) {
            return;
        }
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        let attempts = 0;
        const intervalId = window.setInterval(() => {
            attempts += 1;
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                setDuration(audio.duration);
                if (audio.currentTime > 0) {
                    setCurrentTime(audio.currentTime);
                }
                window.clearInterval(intervalId);
            } else if (attempts >= 20) {
                window.clearInterval(intervalId);
            }
        }, 200);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [audioUrl]);

    const togglePlayback = useCallback(async () => {
        const audio = audioRef.current;
        if (!audio || !audioUrl || loading || error) {
            return;
        }
        if (audio.paused) {
            try {
                await audio.play();
                startRaf();
            } catch (err) {
                console.warn('[AudioWavePlayer] Playback failed', err);
            }
        } else {
            audio.pause();
            stopRaf();
        }
    }, [audioUrl, error, loading, startRaf, stopRaf]);

    const handleWaveClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            const audio = audioRef.current;
            const total = durationOverride && durationOverride > 0 ? durationOverride : duration;
            if (!audio || !audioUrl || total <= 0) {
                return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            audio.currentTime = ratio * total;
            setCurrentTime(audio.currentTime);
            if (!audio.paused) {
                startRaf();
            }
        },
        [audioUrl, duration, durationOverride, startRaf]
    );

    const effectiveDuration = durationOverride && durationOverride > 0 ? durationOverride : duration;
    const progress = effectiveDuration > 0 ? clamp(currentTime / effectiveDuration, 0, 1) : 0;
    const activeBars = Math.round(progress * bars.length);

    return (
        <div className="frsc gap-3 w-full min-w-0">
            <button
                type="button"
                onClick={togglePlayback}
                disabled={!audioUrl || loading || Boolean(error)}
                aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                className="frcc h-5 w-5 rounded-md border border-primary-200 text-primary-600 transition-colors duration-150 hover:border-primary hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isPlaying ? (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
                        <path d="M8 5l11 7-11 7V5z" />
                    </svg>
                )}
            </button>

            <div className="flex-1 min-w-0">
                <div
                    role="button"
                    tabIndex={0}
                    onClick={handleWaveClick}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            void togglePlayback();
                        }
                    }}
                    className="grid w-full items-end gap-1 cursor-pointer select-none"
                    style={{gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`}}
                >
                    {bars.map((value, index) => {
                        const height = Math.max(WAVE_MIN_HEIGHT, Math.round(value * WAVE_MAX_HEIGHT));
                        const active = index < activeBars;
                        return (
                            <span
                                key={`wave-${index}`}
                                className={`block w-full max-w-[6px] justify-self-center rounded-full transition-colors duration-150 ${active ? 'bg-primary-600' : 'bg-primary-200/70'}`}
                                style={{height: `${height}px`}}
                            />
                        );
                    })}
                </div>
                <div className="mt-1 text-xs text-text-tertiary">
                    {formatTime(currentTime)} / {formatTime(effectiveDuration || 0)}
                </div>

                {(loading || waveformLoading) && (
                    <div className="mt-2 text-xs text-text-tertiary">
                        {loading ? 'Loading audio...' : 'Building waveform...'}
                    </div>
                )}
                {!loading && error && (
                    <div className="mt-2 frsc gap-2 text-xs text-text-tertiary">
                        <span>{error}</span>
                        {onRetry && (
                            <button
                                type="button"
                                className="text-primary-600 hover:text-primary-700 underline underline-offset-2"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onRetry();
                                }}
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}
            </div>

            <audio
                ref={audioRef}
                src={audioUrl}
                preload="auto"
                className="absolute opacity-0 pointer-events-none h-0 w-0"
            />
        </div>
    );
};

export default AudioWavePlayer;
