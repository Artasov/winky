import axios, {AxiosInstance} from 'axios';
import type {BaseLLMService} from '../BaseLLMService';

export abstract class ApiLLMBaseService implements BaseLLMService {
    protected accessToken?: string;
    protected readonly model: string;
    protected readonly client: AxiosInstance;
    public supportsStreaming: boolean = false;

    protected constructor(model: string, accessToken?: string) {
        this.model = model;
        this.accessToken = accessToken;
        this.client = axios.create({timeout: 120_000});
    }

    updateAccessToken(token?: string) {
        this.accessToken = token;
    }

    protected abstract buildUrl(): string;

    protected buildHeaders(): Record<string, string> {
        if (!this.accessToken) {
            return {};
        }
        return {
            Authorization: `Bearer ${this.accessToken}`
        };
    }

    protected buildBody(text: string, prompt: string): unknown {
        return {
            model: this.model,
            input: text,
            prompt
        };
    }

    protected extractResult(response: any): string {
        if (!response) {
            throw new Error('Пустой ответ от LLM.');
        }
        if (typeof response === 'string') {
            return response;
        }
        if (response.result) {
            return response.result;
        }
        if (response.choices?.length) {
            const message = response.choices[0]?.message;
            if (typeof message === 'string') {
                return message;
            }
            if (message?.content) {
                if (typeof message.content === 'string') {
                    return message.content;
                }
                if (Array.isArray(message.content)) {
                    return message.content
                        .map((item: any) => (typeof item === 'string' ? item : item?.text ?? ''))
                        .join('\n');
                }
            }
        }
        return JSON.stringify(response);
    }

    async process(text: string, prompt: string): Promise<string> {
        const url = this.buildUrl();
        const body = this.buildBody(text, prompt);
        const headers = this.buildHeaders();

        const {data} = await this.client.post(url, body, {headers});
        return this.extractResult(data);
    }

    async processStream(text: string, prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        if (!this.supportsStreaming) {
            // Fallback to non-streaming
            const result = await this.process(text, prompt);
            onChunk(result);
            return result;
        }

        const url = this.buildUrl();
        const body = {...this.buildBody(text, prompt) as any, stream: true};
        const headers = this.buildHeaders();

        let fullText = '';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(body)
        });

        if (!response.body) {
            throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

                for (const line of lines) {
                    const data = line.replace(/^data:\s*/, '');
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            fullText += content;
                            onChunk(content);
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return fullText;
    }
}

export default ApiLLMBaseService;
