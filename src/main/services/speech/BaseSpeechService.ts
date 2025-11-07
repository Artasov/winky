export interface BaseSpeechService {
    startRecording(): Promise<MediaStream>;

    stopRecording(): Promise<Blob>;

    transcribe(blob: Blob): Promise<string>;

    getStream(): MediaStream | null;
}
