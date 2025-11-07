import axios, {AxiosInstance} from 'axios';
import RecordingSpeechBaseService from './RecordingSpeechBaseService';

export abstract class LocalSpeechBaseService extends RecordingSpeechBaseService {
    protected readonly model: string;
    protected readonly client: AxiosInstance;

    protected constructor(model: string) {
        super();
        this.model = model;
        this.client = axios.create({baseURL: 'https://xldev.ru', timeout: 120_000});
    }

    protected buildEndpoint(): string {
        return '/v1/audio/transcriptions';
    }

    protected buildFormData(blob: Blob): FormData {
        const formData = new FormData();
        formData.append('file', blob, 'audio.wav');
        formData.append('model', this.model);
        formData.append('response_format', 'json');
        return formData;
    }

    protected extractTranscript(response: any): string {
        if (!response) {
            throw new Error('Пустой ответ от локального сервиса распознавания.');
        }
        if (typeof response === 'string') {
            return response;
        }
        if (response.text) {
            return response.text;
        }
        if (response.data?.text) {
            return response.data.text;
        }
        return JSON.stringify(response);
    }

    async transcribe(blob: Blob): Promise<string> {
        const url = this.buildEndpoint();
        const formData = this.buildFormData(blob);
        const {data} = await this.client.post(url, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        return this.extractTranscript(data);
    }
}

export default LocalSpeechBaseService;
