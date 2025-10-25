import axios from 'axios';
import { SPEECH_TRANSCRIBE_ENDPOINT } from '@shared/constants';
import type { BaseSpeechService } from './BaseSpeechService';

export class ApiSpeechService implements BaseSpeechService {
  private accessToken?: string;

  private mediaRecorder: MediaRecorder | null = null;

  private chunks: BlobPart[] = [];

  private stream: MediaStream | null = null;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  updateAccessToken(token?: string) {
    this.accessToken = token;
  }

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
      const recorder = this.mediaRecorder;

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

  async transcribe(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');

    const response = await axios.post(SPEECH_TRANSCRIBE_ENDPOINT, formData, {
      headers: this.accessToken
        ? {
            Authorization: `Bearer ${this.accessToken}`
          }
        : undefined
    });

    if (response.data?.text) {
      return response.data.text;
    }

    if (typeof response.data === 'string') {
      return response.data;
    }

    throw new Error('Не удалось распознать речь.');
  }
}

export default ApiSpeechService;
