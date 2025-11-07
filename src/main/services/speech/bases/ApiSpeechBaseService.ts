import axios, {AxiosInstance} from 'axios';
import RecordingSpeechBaseService from './RecordingSpeechBaseService';

export abstract class ApiSpeechBaseService extends RecordingSpeechBaseService {
    protected readonly model: string;
    protected accessToken?: string;
    protected readonly client: AxiosInstance;

    protected constructor(model: string, accessToken?: string) {
        super();
        this.model = model;
        this.accessToken = accessToken;
        this.client = axios.create({timeout: 120_000});
    }

    updateAccessToken(token?: string) {
        this.accessToken = token;
    }

    protected abstract getEndpoint(): string;

    protected buildHeaders(): Record<string, string> {
        if (!this.accessToken) {
            return {};
        }
        return {
            Authorization: `Bearer ${this.accessToken}`
        };
    }

    protected buildFormData(blob: Blob): FormData {
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');
        formData.append('model', this.model);
        return formData;
    }

    protected extractTranscript(response: any): string {
        if (!response) {
            throw new Error('Пустой ответ сервиса распознавания.');
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
        const endpoint = this.getEndpoint();
        const headers = this.buildHeaders();
        const formData = this.buildFormData(blob);
        const {data} = await this.client.post(endpoint, formData, {headers});
        return this.extractTranscript(data);
    }
}

export default ApiSpeechBaseService;
