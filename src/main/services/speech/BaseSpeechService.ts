export interface BaseSpeechService {
  startRecording(): Promise<void>;
  stopRecording(): Promise<Blob>;
  transcribe(blob: Blob): Promise<string>;
}
