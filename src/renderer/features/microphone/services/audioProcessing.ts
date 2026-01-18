type TrimSilenceOptions = {
    threshold?: number;
    paddingMs?: number;
    minDurationMs?: number;
};

type TrimResult = {
    audioData: ArrayBuffer;
    mimeType: string;
    trimmed: boolean;
};

const DEFAULT_THRESHOLD = 0.015;
const DEFAULT_PADDING_MS = 120;
const DEFAULT_MIN_DURATION_MS = 200;

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

const findTrimRange = (buffer: AudioBuffer, threshold: number, paddingMs: number) => {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));
    const paddingSamples = Math.floor((paddingMs / 1000) * sampleRate);
    let startIndex = -1;
    let endIndex = -1;

    for (let offset = 0; offset < channelData.length; offset += windowSize) {
        let peak = 0;
        const end = Math.min(channelData.length, offset + windowSize);
        for (let i = offset; i < end; i += 1) {
            const value = Math.abs(channelData[i]);
            if (value > peak) {
                peak = value;
            }
        }
        if (peak >= threshold) {
            if (startIndex === -1) {
                startIndex = offset;
            }
            endIndex = end;
        }
    }

    if (startIndex === -1 || endIndex === -1) {
        return {start: 0, end: buffer.length};
    }

    const start = Math.max(0, startIndex - paddingSamples);
    const end = Math.min(buffer.length, endIndex + paddingSamples);
    return {start, end};
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

export const trimSilenceFromAudioBlob = async (
    blob: Blob,
    options: TrimSilenceOptions = {}
): Promise<TrimResult> => {
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const paddingMs = options.paddingMs ?? DEFAULT_PADDING_MS;
    const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
    const originalBuffer = await blob.arrayBuffer();

    try {
        const decoded = await decodeAudioBuffer(originalBuffer);
        if (!decoded) {
            return {audioData: originalBuffer, mimeType: blob.type || 'audio/webm', trimmed: false};
        }

        const {start, end} = findTrimRange(decoded, threshold, paddingMs);
        const trimmedBuffer = sliceAudioBuffer(decoded, start, end);
        if (!trimmedBuffer) {
            return {audioData: originalBuffer, mimeType: blob.type || 'audio/webm', trimmed: false};
        }

        const trimmedDurationMs = (trimmedBuffer.length / trimmedBuffer.sampleRate) * 1000;
        if (trimmedDurationMs < minDurationMs) {
            return {audioData: originalBuffer, mimeType: blob.type || 'audio/webm', trimmed: false};
        }

        const wavData = encodeWav(trimmedBuffer);
        return {audioData: wavData, mimeType: 'audio/wav', trimmed: true};
    } catch (error) {
        console.warn('[audioProcessing] Failed to trim silence, using original audio', error);
        return {audioData: originalBuffer, mimeType: blob.type || 'audio/webm', trimmed: false};
    }
};
