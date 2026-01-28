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

const DEFAULT_THRESHOLD = 0.015;
const DEFAULT_THRESHOLD_RATIO = 0.05;
const DEFAULT_MIN_THRESHOLD = 0.01;
const DEFAULT_PADDING_MS = 10;
const DEFAULT_MIN_DURATION_MS = 120;
const DEFAULT_MIN_SEGMENT_MS = 80;

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
        const cloned = data.slice(0);
        return await audioContext.decodeAudioData(cloned);
    } finally {
        audioContext.close().catch(() => {});
    }
};

const findTrimSegments = (
    buffer: AudioBuffer,
    threshold: number,
    paddingMs: number,
    minSegmentMs: number
) => {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));
    const paddingSamples = Math.floor((paddingMs / 1000) * sampleRate);
    const minSegmentSamples = Math.max(1, Math.floor((minSegmentMs / 1000) * sampleRate));
    const segments: Array<{start: number; end: number}> = [];
    let currentStart = -1;
    let currentEnd = -1;

    for (let offset = 0; offset < channelData.length; offset += windowSize) {
        const end = Math.min(channelData.length, offset + windowSize);
        let sumSquares = 0;
        for (let i = offset; i < end; i += 1) {
            const value = channelData[i];
            sumSquares += value * value;
        }
        const rms = Math.sqrt(sumSquares / Math.max(1, end - offset));
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

const sliceAudioBuffer = (buffer: AudioBuffer, start: number, end: number) => {
    const length = Math.max(0, end - start);
    if (length <= 0) {
        return null;
    }
    const trimmed = new AudioBuffer({
        length,
        numberOfChannels: buffer.numberOfChannels,
        sampleRate: buffer.sampleRate
    });
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const source = buffer.getChannelData(channel).subarray(start, end);
        trimmed.getChannelData(channel).set(source);
    }
    return trimmed;
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

const createSilentBuffer = (sampleRate: number, durationMs: number, channels = 1) => {
    const length = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
    return new AudioBuffer({
        length,
        numberOfChannels: channels,
        sampleRate
    });
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
        const buffer = await blob.arrayBuffer();
        const decoded = await decodeAudioBuffer(buffer);
        if (!decoded) {
            console.warn('[audioProcessing] isAudioSilent: failed to decode, treating as silent');
            return true;
        }

        const channelData = decoded.getChannelData(0);
        const sampleRate = decoded.sampleRate;
        const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));

        let maxRms = 0;
        let sumRms = 0;
        let windowCount = 0;
        const rmsValues: number[] = [];

        for (let offset = 0; offset < channelData.length; offset += windowSize) {
            const end = Math.min(channelData.length, offset + windowSize);
            let sumSquares = 0;
            for (let i = offset; i < end; i += 1) {
                const value = channelData[i];
                sumSquares += value * value;
            }
            const rms = Math.sqrt(sumSquares / Math.max(1, end - offset));
            rmsValues.push(rms);
            sumRms += rms;
            windowCount += 1;
            if (rms > maxRms) {
                maxRms = rms;
            }
        }

        const avgRms = windowCount > 0 ? sumRms / windowCount : 0;
        const SPEECH_WINDOW_THRESHOLD = 0.05;
        const loudWindows = rmsValues.filter(rms => rms >= SPEECH_WINDOW_THRESHOLD).length;
        const loudWindowsPercent = windowCount > 0 ? (loudWindows / windowCount) * 100 : 0;

        const AVG_RMS_THRESHOLD = 0.025;
        const LOUD_WINDOWS_PERCENT_THRESHOLD = 8;
        const MAX_RMS_THRESHOLD = 0.15;

        const isSilentByAverage = avgRms < AVG_RMS_THRESHOLD;
        const isSilentByLoudWindows = loudWindowsPercent < LOUD_WINDOWS_PERCENT_THRESHOLD;
        const hasLoudPeaks = maxRms >= MAX_RMS_THRESHOLD;

        const isSilent = isSilentByAverage && isSilentByLoudWindows && !hasLoudPeaks;
        return isSilent;
    } catch (error) {
        console.warn('[audioProcessing] Failed to check if audio is silent', error);
        return true;
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
    const originalBuffer = await blob.arrayBuffer();

    try {
        const decoded = await decodeAudioBuffer(originalBuffer);
        if (!decoded) {
            const silentBuffer = createSilentBuffer(16000, minDurationMs);
            return {audioData: encodeWav(silentBuffer), mimeType: 'audio/wav', trimmed: true, isSilent: true};
        }

        const channelData = decoded.getChannelData(0);
        const sampleRate = decoded.sampleRate;
        const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));

        let maxRms = 0;
        let sumRms = 0;
        let windowCount = 0;
        const rmsValues: number[] = [];

        for (let offset = 0; offset < channelData.length; offset += windowSize) {
            const end = Math.min(channelData.length, offset + windowSize);
            let sumSquares = 0;
            for (let i = offset; i < end; i += 1) {
                const value = channelData[i];
                sumSquares += value * value;
            }
            const rms = Math.sqrt(sumSquares / Math.max(1, end - offset));
            rmsValues.push(rms);
            sumRms += rms;
            windowCount += 1;
            if (rms > maxRms) {
                maxRms = rms;
            }
        }

        // Вычисляем статистику для более надежного определения тишины
        const avgRms = windowCount > 0 ? sumRms / windowCount : 0;

        // Считаем процент "громких" окон (где есть речь или громкие звуки)
        const SPEECH_WINDOW_THRESHOLD = 0.05; // Порог для определения "громкого" окна (снижен для тихой речи)
        const loudWindows = rmsValues.filter(rms => rms >= SPEECH_WINDOW_THRESHOLD).length;
        const loudWindowsPercent = windowCount > 0 ? (loudWindows / windowCount) * 100 : 0;

        // Проверяем, является ли аудио тишиной по нескольким критериям:
        // 1. Средний RMS должен быть низким (основной критерий)
        // 2. Процент громких окон должен быть низким (защита от случайных щелчков)
        // 3. Максимальный RMS не должен быть слишком высоким (если есть явная речь)
        const AVG_RMS_THRESHOLD = 0.025; // Средний RMS для речи обычно > 0.03-0.05
        const LOUD_WINDOWS_PERCENT_THRESHOLD = 8; // Если > 8% окон громкие, вероятно есть речь
        const MAX_RMS_THRESHOLD = 0.15; // Если максимум высокий, точно не тишина

        const isSilentByAverage = avgRms < AVG_RMS_THRESHOLD;
        const isSilentByLoudWindows = loudWindowsPercent < LOUD_WINDOWS_PERCENT_THRESHOLD;
        const hasLoudPeaks = maxRms >= MAX_RMS_THRESHOLD;

        // Тишина только если средний низкий И мало громких окон И нет явных пиков речи
        const isSilent = isSilentByAverage && isSilentByLoudWindows && !hasLoudPeaks;

        if (isSilent) {
            const silentBuffer = createSilentBuffer(decoded.sampleRate, minDurationMs, decoded.numberOfChannels);
            return {audioData: encodeWav(silentBuffer), mimeType: 'audio/wav', trimmed: true, isSilent: true};
        }

        const dynamicThreshold = Math.max(minThreshold, maxRms * thresholdRatio);
        const threshold = Math.max(explicitThreshold, dynamicThreshold);
        const segments = findTrimSegments(decoded, threshold, paddingMs, minSegmentMs);

        if (segments.length === 0) {
            const silentBuffer = createSilentBuffer(decoded.sampleRate, minDurationMs, decoded.numberOfChannels);
            return {audioData: encodeWav(silentBuffer), mimeType: 'audio/wav', trimmed: true, isSilent: true};
        }

        const combined = concatAudioSegments(decoded, segments);
        if (!combined) {
            const silentBuffer = createSilentBuffer(decoded.sampleRate, minDurationMs, decoded.numberOfChannels);
            return {audioData: encodeWav(silentBuffer), mimeType: 'audio/wav', trimmed: true, isSilent: true};
        }

        const trimmedDurationMs = (combined.length / combined.sampleRate) * 1000;
        if (trimmedDurationMs < minDurationMs) {
            const silentBuffer = createSilentBuffer(decoded.sampleRate, minDurationMs, decoded.numberOfChannels);
            return {audioData: encodeWav(silentBuffer), mimeType: 'audio/wav', trimmed: true, isSilent: true};
        }

        const wavData = encodeWav(combined);
        return {audioData: wavData, mimeType: 'audio/wav', trimmed: true, isSilent: false};
    } catch (error) {
        console.warn('[audioProcessing] Failed to trim silence, sending minimal audio', error);
        const silentBuffer = createSilentBuffer(16000, minDurationMs);
        return {audioData: encodeWav(silentBuffer), mimeType: 'audio/wav', trimmed: true, isSilent: true};
    }
};
