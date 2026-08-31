export type SpeechRecorderState = 'idle' | 'starting' | 'recording' | 'stopping';

export type SpeechRecorderEvents = {
    onStateChange?: (state: SpeechRecorderState) => void;
    onError?: (error: Error) => void;
};

export interface SpeechRecorder {
    startRecording(): Promise<MediaStream>;
    stopRecording(): Promise<Blob>;
    cancelRecording(): void;
    warmUp(): Promise<void>;
    dispose(): void;
    getState(): SpeechRecorderState;
    isRecordingActive(): boolean;
}

const SUPPORTABLE_MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus'
];

const WARM_STREAM_RELEASE_MS = 5_000;
const STOP_TIMEOUT_MS = 3_000;

const resolveMimeType = (): string | undefined => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
        return undefined;
    }

    for (const mimeType of SUPPORTABLE_MIME_TYPES) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            return mimeType;
        }
    }

    return undefined;
};

const getErrorName = (error: unknown): string => {
    if (error instanceof Error) return error.name;
    if (typeof error === 'object' && error !== null && 'name' in error) return String(error.name);
    return '';
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
    return String(error || 'Unknown microphone error.');
};

const createAbortError = (): DOMException => new DOMException('Recording operation was cancelled.', 'AbortError');

export const isSpeechRecorderAbortError = (error: unknown): boolean => getErrorName(error) === 'AbortError';

const isSelectedDeviceUnavailable = (error: unknown): boolean => {
    const name = getErrorName(error);
    return name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError';
};

const toRecorderError = (event: Event): Error => {
    if ('error' in event && event.error instanceof Error) return event.error;
    return new Error('Microphone recording failed.');
};

export class BrowserSpeechRecorder implements SpeechRecorder {
    private state: SpeechRecorderState = 'idle';
    private mediaStream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private readonly mimeType = resolveMimeType();
    private streamPromise: Promise<MediaStream> | null = null;
    private startPromise: Promise<MediaStream> | null = null;
    private stopPromise: Promise<Blob> | null = null;
    private rejectStop: ((error: unknown) => void) | null = null;
    private releaseTimer: number | null = null;
    private operationId = 0;
    private streamRequestId = 0;
    private disposed = false;
    private readonly deviceId?: string;
    private readonly events: SpeechRecorderEvents;
    private readonly trackEndedHandlers = new Map<MediaStreamTrack, () => void>();

    constructor(deviceId?: string, events: SpeechRecorderEvents = {}) {
        this.deviceId = deviceId;
        this.events = events;
    }

    startRecording(): Promise<MediaStream> {
        if (this.disposed) return Promise.reject(new Error('Speech recorder has been disposed.'));
        if (!navigator.mediaDevices?.getUserMedia) {
            return Promise.reject(new Error('Microphone is not available in this environment.'));
        }
        if (this.state === 'recording' && this.mediaStream && this.isStreamActive(this.mediaStream)) {
            return Promise.resolve(this.mediaStream);
        }
        if (this.startPromise) return this.startPromise;
        if (this.state === 'stopping' && this.stopPromise) {
            return this.stopPromise.catch(() => null).then(() => this.startRecording());
        }

        const operationId = ++this.operationId;
        this.clearReleaseTimer();
        this.setState('starting');

        const promise = (async () => {
            try {
                const stream = await this.getMediaStream();
                if (this.disposed || operationId !== this.operationId || this.state !== 'starting') {
                    throw createAbortError();
                }

                const recorder = new MediaRecorder(stream, this.mimeType ? {mimeType: this.mimeType} : undefined);
                this.chunks = [];
                this.mediaRecorder = recorder;
                recorder.addEventListener('dataavailable', this.handleDataAvailable);
                recorder.addEventListener('error', this.handleRecorderError);
                recorder.start();
                this.setState('recording');
                return stream;
            } catch (error) {
                if (operationId === this.operationId && !this.disposed) {
                    this.clearRecorder();
                    this.releaseMediaStream();
                    this.setState('idle');
                }
                throw error;
            }
        })();

        this.startPromise = promise;
        void promise.finally(() => {
            if (this.startPromise === promise) this.startPromise = null;
        }).catch(() => {});
        return promise;
    }

    stopRecording(): Promise<Blob> {
        if (this.stopPromise) return this.stopPromise;
        if (this.state === 'starting' && this.startPromise) {
            return this.startPromise.then(() => this.stopRecording());
        }

        const recorder = this.mediaRecorder;
        if (!recorder || this.state !== 'recording') {
            return Promise.reject(new Error('Recording has not started yet.'));
        }

        this.setState('stopping');
        const promise = new Promise<Blob>((resolve, reject) => {
            let settled = false;
            let stopTimer: number | null = null;

            const clearListeners = () => {
                if (stopTimer !== null) {
                    clearTimeout(stopTimer);
                    stopTimer = null;
                }
                recorder.removeEventListener('stop', handleStop);
                recorder.removeEventListener('error', handleError);
                if (this.rejectStop === handleCancellation) this.rejectStop = null;
            };

            const complete = (callback: () => void) => {
                if (settled) return;
                settled = true;
                clearListeners();
                this.clearRecorder();
                this.releaseMediaStream();
                this.setState('idle');
                callback();
            };

            const handleStop = () => {
                const blob = new Blob(this.chunks, {
                    type: recorder.mimeType || this.mimeType || 'audio/webm'
                });
                complete(() => resolve(blob));
            };

            const handleError = (event: Event) => {
                const error = toRecorderError(event);
                this.events.onError?.(error);
                complete(() => reject(error));
            };

            const handleCancellation = (error: unknown) => complete(() => reject(error));

            recorder.addEventListener('stop', handleStop);
            recorder.addEventListener('error', handleError);
            this.rejectStop = handleCancellation;
            stopTimer = window.setTimeout(() => {
                const error = new Error('Microphone recording did not stop in time.');
                this.events.onError?.(error);
                complete(() => reject(error));
            }, STOP_TIMEOUT_MS);

            try {
                if (recorder.state === 'inactive') {
                    handleStop();
                } else {
                    recorder.stop();
                }
            } catch (error) {
                complete(() => reject(error));
            }
        });

        this.stopPromise = promise;
        void promise.finally(() => {
            if (this.stopPromise === promise) this.stopPromise = null;
        }).catch(() => {});
        return promise;
    }

    cancelRecording(): void {
        if (this.disposed) return;
        this.operationId += 1;
        this.startPromise = null;
        this.clearReleaseTimer();

        const rejectStop = this.rejectStop;
        if (rejectStop) {
            rejectStop(createAbortError());
            return;
        }

        const recorder = this.mediaRecorder;
        this.clearRecorder();
        if (recorder && recorder.state !== 'inactive') {
            try {
                recorder.stop();
            } catch {
                // The stream is released below even when MediaRecorder already stopped itself.
            }
        }
        this.releaseMediaStream();
        this.setState('idle');
    }

    async warmUp(): Promise<void> {
        if (this.disposed || this.state !== 'idle') return;
        const stream = await this.getMediaStream();
        if (this.disposed) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        if (this.state === 'idle') this.scheduleStreamRelease();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.operationId += 1;
        this.startPromise = null;
        this.clearReleaseTimer();
        const rejectStop = this.rejectStop;
        if (rejectStop) rejectStop(createAbortError());

        const recorder = this.mediaRecorder;
        this.clearRecorder();
        if (recorder && recorder.state !== 'inactive') {
            try {
                recorder.stop();
            } catch {
                // The stream is released below.
            }
        }
        this.releaseMediaStream();
        this.state = 'idle';
    }

    getState(): SpeechRecorderState {
        return this.state;
    }

    isRecordingActive(): boolean {
        return this.state === 'recording' && this.mediaRecorder?.state === 'recording';
    }

    private getMediaStream(): Promise<MediaStream> {
        if (this.mediaStream && this.isStreamActive(this.mediaStream)) return Promise.resolve(this.mediaStream);
        if (this.mediaStream) this.releaseMediaStream();
        if (this.streamPromise) return this.streamPromise;

        const requestId = ++this.streamRequestId;
        const promise = this.requestMediaStream()
            .then((stream) => {
                if (this.disposed || requestId !== this.streamRequestId) {
                    stream.getTracks().forEach((track) => track.stop());
                    throw createAbortError();
                }
                this.setMediaStream(stream);
                return stream;
            })
            .finally(() => {
                if (this.streamPromise === promise) this.streamPromise = null;
            });
        this.streamPromise = promise;
        return promise;
    }

    private async requestMediaStream(): Promise<MediaStream> {
        const selectedDevice = this.deviceId && this.deviceId !== 'default';
        if (!selectedDevice) return navigator.mediaDevices.getUserMedia({audio: true});

        try {
            return await navigator.mediaDevices.getUserMedia({
                audio: {deviceId: {exact: this.deviceId}}
            });
        } catch (error) {
            if (!isSelectedDeviceUnavailable(error)) throw error;
            console.warn('[SpeechRecorder] Selected microphone is unavailable, using the default device.', {
                provider: 'microphone',
                model: 'selected-device',
                status: getErrorName(error) || 'device-unavailable'
            });
            return navigator.mediaDevices.getUserMedia({audio: true});
        }
    }

    private setMediaStream(stream: MediaStream): void {
        if (this.mediaStream && this.mediaStream !== stream) this.releaseMediaStream();
        this.mediaStream = stream;
        for (const track of stream.getAudioTracks()) {
            const handleEnded = () => this.handleTrackEnded(stream);
            this.trackEndedHandlers.set(track, handleEnded);
            track.addEventListener('ended', handleEnded);
        }
    }

    private handleTrackEnded(stream: MediaStream): void {
        if (stream !== this.mediaStream || this.isStreamActive(stream)) return;
        if (this.state === 'recording') {
            const error = new Error('Microphone was disconnected during recording.');
            void this.stopRecording()
                .then(() => this.events.onError?.(error))
                .catch((stopError) => {
                    if (!isSpeechRecorderAbortError(stopError)) {
                        this.events.onError?.(new Error(getErrorMessage(stopError)));
                    }
                });
            return;
        }
        if (this.state === 'starting') {
            this.operationId += 1;
            this.events.onError?.(new Error('Microphone became unavailable before recording started.'));
        }
        this.releaseMediaStream();
        this.setState('idle');
    }

    private readonly handleDataAvailable = (event: BlobEvent): void => {
        if (event.data?.size > 0) this.chunks.push(event.data);
    };

    private readonly handleRecorderError = (event: Event): void => {
        if (this.state === 'stopping') return;
        const error = toRecorderError(event);
        this.events.onError?.(error);
        this.cancelRecording();
    };

    private isStreamActive(stream: MediaStream): boolean {
        return stream.getAudioTracks().some((track) => track.readyState === 'live');
    }

    private scheduleStreamRelease(): void {
        this.clearReleaseTimer();
        this.releaseTimer = window.setTimeout(() => {
            this.releaseTimer = null;
            if (this.state === 'idle') this.releaseMediaStream();
        }, WARM_STREAM_RELEASE_MS);
    }

    private clearReleaseTimer(): void {
        if (this.releaseTimer === null) return;
        clearTimeout(this.releaseTimer);
        this.releaseTimer = null;
    }

    private clearRecorder(): void {
        if (this.mediaRecorder) {
            this.mediaRecorder.removeEventListener('dataavailable', this.handleDataAvailable);
            this.mediaRecorder.removeEventListener('error', this.handleRecorderError);
        }
        this.mediaRecorder = null;
        this.chunks = [];
    }

    private releaseMediaStream(): void {
        this.streamRequestId += 1;
        this.streamPromise = null;
        const stream = this.mediaStream;
        this.mediaStream = null;
        if (!stream) return;

        for (const track of stream.getTracks()) {
            const handleEnded = this.trackEndedHandlers.get(track);
            if (handleEnded) track.removeEventListener('ended', handleEnded);
            this.trackEndedHandlers.delete(track);
            track.stop();
        }
    }

    private setState(state: SpeechRecorderState): void {
        if (this.state === state) return;
        this.state = state;
        if (!this.disposed) this.events.onStateChange?.(state);
    }
}

export const createSpeechRecorder = (
    deviceId?: string,
    events: SpeechRecorderEvents = {}
): SpeechRecorder => new BrowserSpeechRecorder(deviceId, events);
