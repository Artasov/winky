export interface SpeechRecorder {
    startRecording(): Promise<MediaStream>;
    stopRecording(): Promise<Blob>;
    warmUp(): Promise<void>;
    dispose(): void;
    isRecordingActive(): boolean;
}

const SUPPORTABLE_MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus'
];

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

export class BrowserSpeechRecorder implements SpeechRecorder {
    private mediaStream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private readonly mimeType = resolveMimeType();
    private streamPromise: Promise<MediaStream> | null = null;
    private releaseTimer: number | null = null;
    private readonly STREAM_KEEP_ALIVE_MS = 5 * 60 * 1000;

    async startRecording(): Promise<MediaStream> {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Microphone is not available in this environment.');
        }

        if (this.mediaRecorder) {
            await this.stopRecording().catch(() => {
                /* noop */
            });
        }

        this.clearReleaseTimer();
        const stream = await this.ensureMediaStream();
        this.mediaRecorder = new MediaRecorder(stream, this.mimeType ? {mimeType: this.mimeType} : undefined);
        this.chunks = [];

        this.mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data && event.data.size > 0) {
                this.chunks.push(event.data);
            }
        });

        this.mediaRecorder.start();
        return stream;
    }

    stopRecording(): Promise<Blob> {
        const recorder = this.mediaRecorder;
        if (!recorder) {
            return Promise.reject(new Error('Recording has not started yet.'));
        }

        return new Promise<Blob>((resolve, reject) => {
            const handleStop = () => {
                recorder.removeEventListener('stop', handleStop);
                recorder.removeEventListener('error', handleError);
                const blob = new Blob(this.chunks, {type: recorder.mimeType || this.mimeType || 'audio/webm'});
                this.cleanup(false);
                this.scheduleStreamRelease();
                resolve(blob);
            };

            const handleError = (event: Event) => {
                recorder.removeEventListener('stop', handleStop);
                recorder.removeEventListener('error', handleError);
                this.cleanup(false);
                this.scheduleStreamRelease();
                reject(event);
            };

            recorder.addEventListener('stop', handleStop);
            recorder.addEventListener('error', handleError);
            recorder.stop();
        });
    }

    async warmUp(): Promise<void> {
        try {
            await this.ensureMediaStream();
        } catch (error) {
            console.warn('[SpeechRecorder] Warm-up failed', error);
        }
    }

    dispose(): void {
        this.clearReleaseTimer();
        this.cleanup(true);
    }

    isRecordingActive(): boolean {
        return this.mediaRecorder?.state === 'recording';
    }

    private async ensureMediaStream(): Promise<MediaStream> {
        if (this.mediaStream && this.isStreamActive(this.mediaStream)) {
            return this.mediaStream;
        }
        if (this.streamPromise) {
            return this.streamPromise;
        }

        this.streamPromise = navigator.mediaDevices.getUserMedia({audio: true})
            .then((stream) => {
                this.mediaStream = stream;
                this.streamPromise = null;
                return stream;
            })
            .catch((error) => {
                this.streamPromise = null;
                // Если это ошибка разрешения, очищаем состояние чтобы можно было попробовать снова
                const errorName = error?.name || '';
                const errorMessage = error?.message || '';
                if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || 
                    errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
                    // Очищаем mediaStream чтобы при следующем вызове getUserMedia попытался запросить доступ снова
                    // getUserMedia покажет диалог запроса разрешения при следующем вызове
                    // если разрешение еще не было окончательно заблокировано в настройках
                    this.mediaStream = null;
                    console.warn('[SpeechRecorder] Microphone permission denied, will retry on next attempt');
                }
                throw error;
            });

        return this.streamPromise;
    }

    private isStreamActive(stream: MediaStream): boolean {
        return stream.getTracks().some((track) => track.readyState === 'live');
    }

    private scheduleStreamRelease(): void {
        this.clearReleaseTimer();
        this.releaseTimer = window.setTimeout(() => {
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach((track) => track.stop());
                this.mediaStream = null;
            }
        }, this.STREAM_KEEP_ALIVE_MS);
    }

    private clearReleaseTimer(): void {
        if (this.releaseTimer !== null) {
            clearTimeout(this.releaseTimer);
            this.releaseTimer = null;
        }
    }

    private cleanup(stopTracks = false): void {
        if (this.mediaRecorder) {
            this.mediaRecorder.ondataavailable = null;
            this.mediaRecorder = null;
        }

        if (this.mediaStream && stopTracks) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
            this.mediaStream = null;
        }

        this.chunks = [];
    }
}

export const createSpeechRecorder = (): SpeechRecorder => new BrowserSpeechRecorder();
