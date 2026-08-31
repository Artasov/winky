type TrimSilenceOptions = {
    threshold?: number;
    thresholdRatio?: number;
    minThreshold?: number;
    paddingMs?: number;
    minDurationMs?: number;
    minSegmentMs?: number;
};

type TrimResult = {
    audioData: ArrayBuffer;
    mimeType: string;
    trimmed: boolean;
    isSilent: boolean;
};

type SilenceAnalysis = {
    isSilent: boolean;
    maxRms: number;
};

const getErrorStatus = (error: unknown): string => error instanceof Error && error.name
    ? error.name
    : 'audio-processing-failed';

const DEFAULT_THRESHOLD = 0.015;
const DEFAULT_THRESHOLD_RATIO = 0.05;
const DEFAULT_MIN_THRESHOLD = 0.01;
const DEFAULT_PADDING_MS = 10;
const DEFAULT_MIN_DURATION_MS = 120;
const DEFAULT_MIN_SEGMENT_MS = 80;
const SILENCE_MAX_RMS_THRESHOLD = 0.006;
const SILENCE_AVG_RMS_THRESHOLD = 0.002;
const ABSOLUTE_TRIM_THRESHOLD = 0.0015;

const resolveAudioContext = () => {
    const AudioContextCtor = (window as typeof window & {webkitAudioContext?: typeof AudioContext}).AudioContext
        ?? (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!AudioContextCtor) {
        return null;
    }
    return new AudioContextCtor();
};

const decodeAudioBuffer = async (data: ArrayBuffer): Promise<AudioBuffer | null> => {
    const audioContext = resolveAudioContext();
    if (!audioContext) {
        return null;
    }
    try {
        return await audioContext.decodeAudioData(data.slice(0));
    } finally {
        audioContext.close().catch(() => {});
    }
};

const toStandaloneArrayBuffer = (data: ArrayBuffer | Uint8Array): ArrayBuffer => {
    if (data instanceof Uint8Array) {
        const arrayBuffer = new ArrayBuffer(data.byteLength);
        new Uint8Array(arrayBuffer).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        return arrayBuffer;
    }
    return data.slice(0);
};

const calculateWindowRms = (buffer: AudioBuffer, start: number, end: number): number => {
    let sumSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const channelData = buffer.getChannelData(channel);
        for (let sample = start; sample < end; sample += 1) {
            const value = channelData[sample] ?? 0;
            sumSquares += value * value;
            sampleCount += 1;
        }
    }

    return Math.sqrt(sumSquares / Math.max(1, sampleCount));
};

const analyzeSilence = (buffer: AudioBuffer): SilenceAnalysis => {
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));
    let maxRms = 0;
    let sumRms = 0;
    let windowCount = 0;

    for (let offset = 0; offset < buffer.length; offset += windowSize) {
        const end = Math.min(buffer.length, offset + windowSize);
        const rms = calculateWindowRms(buffer, offset, end);
        sumRms += rms;
        windowCount += 1;
        if (rms > maxRms) maxRms = rms;
    }

    const avgRms = windowCount > 0 ? sumRms / windowCount : 0;

    return {
        // Silence detection is intentionally conservative: uncertain audio must reach transcription.
        isSilent: maxRms < SILENCE_MAX_RMS_THRESHOLD && avgRms < SILENCE_AVG_RMS_THRESHOLD,
        maxRms
    };
};

const findTrimSegments = (
    buffer: AudioBuffer,
    threshold: number,
    paddingMs: number,
    minSegmentMs: number
) => {
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));
    const paddingSamples = Math.floor((paddingMs / 1000) * sampleRate);
    const minSegmentSamples = Math.max(1, Math.floor((minSegmentMs / 1000) * sampleRate));
    const segments: Array<{start: number; end: number}> = [];
    let currentStart = -1;
    let currentEnd = -1;

    for (let offset = 0; offset < buffer.length; offset += windowSize) {
        const end = Math.min(buffer.length, offset + windowSize);
        const rms = calculateWindowRms(buffer, offset, end);
        if (rms >= threshold) {
            if (currentStart === -1) {
                currentStart = offset;
            }
            currentEnd = end;
        } else if (currentStart !== -1) {
            segments.push({start: currentStart, end: currentEnd});
            currentStart = -1;
            currentEnd = -1;
        }
    }

    if (currentStart !== -1 && currentEnd !== -1) {
        segments.push({start: currentStart, end: currentEnd});
    }

    const expanded = segments
        .map(({start, end}) => ({
            start: Math.max(0, start - paddingSamples),
            end: Math.min(buffer.length, end + paddingSamples)
        }))
        .filter(({start, end}) => (end - start) >= minSegmentSamples);

    if (expanded.length === 0) {
        return [];
    }

    const merged: Array<{start: number; end: number}> = [expanded[0]];
    for (let i = 1; i < expanded.length; i += 1) {
        const last = merged[merged.length - 1];
        const current = expanded[i];
        if (current.start <= last.end) {
            last.end = Math.max(last.end, current.end);
        } else {
            merged.push(current);
        }
    }

    return merged;
};

const concatAudioSegments = (buffer: AudioBuffer, segments: Array<{start: number; end: number}>) => {
    const totalLength = segments.reduce((acc, segment) => acc + Math.max(0, segment.end - segment.start), 0);
    if (totalLength <= 0) {
        return null;
    }
    const combined = new AudioBuffer({
        length: totalLength,
        numberOfChannels: buffer.numberOfChannels,
        sampleRate: buffer.sampleRate
    });
    let offset = 0;
    for (const segment of segments) {
        const length = Math.max(0, segment.end - segment.start);
        if (length <= 0) {
            continue;
        }
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const source = buffer.getChannelData(channel).subarray(segment.start, segment.end);
            combined.getChannelData(channel).set(source, offset);
        }
        offset += length;
    }
    return combined;
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

export const isAudioSilent = async (blob: Blob): Promise<boolean> => {
    try {
        const decoded = await decodeAudioBuffer(await blob.arrayBuffer());
        if (!decoded) {
            console.warn('[audioProcessing] isAudioSilent: decoding is unavailable, preserving audio');
            return false;
        }
        return analyzeSilence(decoded).isSilent;
    } catch (error) {
        console.warn('[audioProcessing] Failed to check if audio is silent', {
            status: getErrorStatus(error),
            sizeBytes: blob.size
        });
        return false;
    }
};

export const isAudioDataSilent = async (data: ArrayBuffer | Uint8Array): Promise<boolean> => {
    try {
        const decoded = await decodeAudioBuffer(toStandaloneArrayBuffer(data));
        if (!decoded) {
            console.warn('[audioProcessing] isAudioDataSilent: decoding is unavailable, preserving audio');
            return false;
        }
        return analyzeSilence(decoded).isSilent;
    } catch (error) {
        console.warn('[audioProcessing] Failed to check raw audio data for silence', {
            status: getErrorStatus(error),
            sizeBytes: data.byteLength
        });
        return false;
    }
};

export const trimSilenceFromAudioBlob = async (
    blob: Blob,
    options: TrimSilenceOptions = {}
): Promise<TrimResult> => {
    const paddingMs = options.paddingMs ?? DEFAULT_PADDING_MS;
    const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
    const minSegmentMs = options.minSegmentMs ?? DEFAULT_MIN_SEGMENT_MS;
    const thresholdRatio = options.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO;
    const minThreshold = options.minThreshold ?? DEFAULT_MIN_THRESHOLD;
    const explicitThreshold = options.threshold ?? DEFAULT_THRESHOLD;

    const originalAudioData = await blob.arrayBuffer();
    const originalResult = (isSilent: boolean): TrimResult => ({
        audioData: originalAudioData.slice(0),
        mimeType: blob.type || 'application/octet-stream',
        trimmed: false,
        isSilent
    });

    try {
        const decoded = await decodeAudioBuffer(originalAudioData);
        if (!decoded) {
            console.warn('[audioProcessing] Audio decoding is unavailable, sending the original recording');
            return originalResult(false);
        }

        const {isSilent, maxRms} = analyzeSilence(decoded);
        if (isSilent) return originalResult(true);

        const dynamicThreshold = Math.max(minThreshold, maxRms * thresholdRatio);
        const thresholdCap = Math.max(ABSOLUTE_TRIM_THRESHOLD, maxRms * 0.75);
        const threshold = Math.min(
            Math.max(ABSOLUTE_TRIM_THRESHOLD, explicitThreshold, dynamicThreshold),
            thresholdCap
        );
        const segments = findTrimSegments(decoded, threshold, paddingMs, minSegmentMs);

        if (segments.length === 0) return originalResult(false);

        const combined = concatAudioSegments(decoded, segments);
        if (!combined) return originalResult(false);

        const trimmedDurationMs = (combined.length / combined.sampleRate) * 1000;
        if (trimmedDurationMs < minDurationMs) return originalResult(false);

        return {audioData: encodeWav(combined), mimeType: 'audio/wav', trimmed: true, isSilent: false};
    } catch (error) {
        console.warn('[audioProcessing] Failed to trim silence, sending the original recording', {
            status: getErrorStatus(error),
            sizeBytes: blob.size
        });
        return originalResult(false);
    }
};
