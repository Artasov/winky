import {useCallback, useRef, useState} from 'react';

type MutableRef<T> = {current: T};

type UseVolumeMonitorParams = {
    windowVisibleRef: MutableRef<boolean>;
};

export const useVolumeMonitor = ({windowVisibleRef}: UseVolumeMonitorParams) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | undefined>(undefined);
    const currentStreamRef = useRef<MediaStream | null>(null);
        const lastCommittedVolumeRef = useRef<{value: number; timestamp: number}>({value: 0, timestamp: 0});
        const lastSampleTimeRef = useRef(0);
    const [volume, setVolume] = useState(0);

    const stopVolumeMonitor = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = undefined;
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {
                /* ignore */
            });
            audioContextRef.current = null;
            analyserRef.current = null;
        }
        lastCommittedVolumeRef.current = {value: 0, timestamp: 0};
        setVolume(0);
        currentStreamRef.current = null;
    }, []);

    const startVolumeMonitor = useCallback(
        (stream: MediaStream) => {
            stopVolumeMonitor();
            currentStreamRef.current = stream;
            if (!windowVisibleRef.current) {
                return;
            }
            try {
                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                const buffer = new Uint8Array(analyser.fftSize);

                const commitVolumeSample = (nextValue: number) => {
                    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                    const previous = lastCommittedVolumeRef.current;
                    const difference = Math.abs(nextValue - previous.value);
                    if (difference < 0.04 && now - previous.timestamp < 80) {
                        return;
                    }
                    lastCommittedVolumeRef.current = {value: nextValue, timestamp: now};
                    setVolume(nextValue);
                };

                const update = () => {
                    if (!windowVisibleRef.current) {
                        animationFrameRef.current = undefined;
                        return;
                    }
                    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                    if (now - lastSampleTimeRef.current < 40) {
                        animationFrameRef.current = requestAnimationFrame(update);
                        return;
                    }
                    lastSampleTimeRef.current = now;
                    analyser.getByteTimeDomainData(buffer);
                    let sumSquares = 0;
                    for (let i = 0; i < buffer.length; i += 1) {
                        const deviation = buffer[i] - 128;
                        sumSquares += deviation * deviation;
                    }
                    const rms = Math.sqrt(sumSquares / buffer.length) / 128;
                    commitVolumeSample(Number.isFinite(rms) ? rms : 0);
                    animationFrameRef.current = requestAnimationFrame(update);
                };

                update();
                audioContextRef.current = audioContext;
                analyserRef.current = analyser;
            } catch (error) {
                console.error('[useVolumeMonitor] Failed to initialize microphone visualization', error);
            }
        },
        [stopVolumeMonitor, windowVisibleRef]
    );

    return {
        volume,
        startVolumeMonitor,
        stopVolumeMonitor,
        currentStreamRef,
        audioContextRef,
        analyserRef,
        animationFrameRef
    };
};
