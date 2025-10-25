import axios, { AxiosInstance } from 'axios';
import type { BaseLLMService } from '../BaseLLMService';

export abstract class LocalLLMBaseService implements BaseLLMService {
  protected readonly model: string;
  protected readonly client: AxiosInstance;

  protected constructor(model: string) {
    this.model = model;
    this.client = axios.create({ baseURL: 'http://localhost:11434', timeout: 120_000 });
  }

  protected abstract buildEndpoint(): string;

  protected buildBody(text: string, prompt: string): unknown {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text }
      ]
    };
  }

  protected extractResult(response: any): string {
    if (!response) {
      throw new Error('Пустой ответ от локальной модели.');
    }
    if (typeof response === 'string') {
      return response;
    }
    if (response.message?.content) {
      if (Array.isArray(response.message.content)) {
        return response.message.content.map((item: any) => item?.text ?? '').join('\n');
      }
      return response.message.content;
    }
    if (response.choices?.length) {
      return response.choices[0]?.message?.content ?? '';
    }
    return JSON.stringify(response);
  }

  async process(text: string, prompt: string): Promise<string> {
    const endpoint = this.buildEndpoint();
    const body = this.buildBody(text, prompt);
    const { data } = await this.client.post(endpoint, body);
    return this.extractResult(data);
  }
}

export default LocalLLMBaseService;
