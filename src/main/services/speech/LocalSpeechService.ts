/* eslint-disable no-console */
import type { BaseSpeechService } from './BaseSpeechService';

export class LocalSpeechService implements BaseSpeechService {
  private mediaRecorder: MediaRecorder | null = null;

  private chunks: BlobPart[] = [];

  private stream: MediaStream | null = null;

  getStream() {
    return this.stream;
  }

  async startRecording(): Promise<MediaStream> {
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Аудио устройства недоступны.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stream = stream;
    this.mediaRecorder = new MediaRecorder(stream);
    this.chunks = [];

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
    return stream;
  }

  async stopRecording(): Promise<Blob> {
    if (!this.mediaRecorder) {
      throw new Error('Запись ещё не началась.');
    }

    return new Promise<Blob>((resolve, reject) => {
      const recorder = this.mediaRecorder as MediaRecorder;

      recorder.onstop = () => {
        try {
          const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
          recorder.stream.getTracks().forEach((track) => track.stop());
          this.mediaRecorder = null;
          this.stream = null;
          this.chunks = [];
          resolve(blob);
        } catch (error) {
          reject(error);
        }
      };

      recorder.onerror = (event) => {
        reject(event.error);
      };

      recorder.stop();
    });
  }

  async transcribe(_blob: Blob): Promise<string> {
    // TODO: replace with actual offline transcription implementation.
    return '[Local transcription is not implemented]';
  }
}

export default LocalSpeechService;
