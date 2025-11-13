export interface SpeechRecorder {
    startRecording(): Promise<MediaStream>;
    stopRecording(): Promise<Blob>;
    dispose(): void;
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

    async startRecording(): Promise<MediaStream> {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Микрофон недоступен в этом окружении.');
        }

        if (this.mediaRecorder) {
            await this.stopRecording().catch(() => {
                /* noop */
            });
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
        this.mediaRecorder = new MediaRecorder(this.mediaStream, this.mimeType ? {mimeType: this.mimeType} : undefined);
        this.chunks = [];

        this.mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data && event.data.size > 0) {
                this.chunks.push(event.data);
            }
        });

        this.mediaRecorder.start();
        return this.mediaStream;
    }

    stopRecording(): Promise<Blob> {
        const recorder = this.mediaRecorder;
        if (!recorder) {
            return Promise.reject(new Error('Запись ещё не началась.'));
        }

        return new Promise<Blob>((resolve, reject) => {
            const handleStop = () => {
                recorder.removeEventListener('stop', handleStop);
                recorder.removeEventListener('error', handleError);
                const blob = new Blob(this.chunks, {type: recorder.mimeType || this.mimeType || 'audio/webm'});
                this.cleanup(true);
                resolve(blob);
            };

            const handleError = (event: Event) => {
                recorder.removeEventListener('stop', handleStop);
                recorder.removeEventListener('error', handleError);
                this.cleanup(true);
                reject(event);
            };

            recorder.addEventListener('stop', handleStop);
            recorder.addEventListener('error', handleError);
            recorder.stop();
        });
    }

    dispose(): void {
        this.cleanup(true);
    }

    private cleanup(stopTracks = false): void {
        if (this.mediaRecorder) {
            this.mediaRecorder.ondataavailable = null;
            this.mediaRecorder = null;
        }

        if (this.mediaStream) {
            if (stopTracks) {
                this.mediaStream.getTracks().forEach((track) => track.stop());
            }
            this.mediaStream = null;
        }

        this.chunks = [];
    }
}

export const createSpeechRecorder = (): SpeechRecorder => new BrowserSpeechRecorder();
