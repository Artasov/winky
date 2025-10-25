import axios, { AxiosInstance } from 'axios';
import type { BaseLLMService } from '../BaseLLMService';

export abstract class ApiLLMBaseService implements BaseLLMService {
  protected accessToken?: string;
  protected readonly model: string;
  protected readonly client: AxiosInstance;

  protected constructor(model: string, accessToken?: string) {
    this.model = model;
    this.accessToken = accessToken;
    this.client = axios.create({ timeout: 120_000 });
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

    const { data } = await this.client.post(url, body, { headers });
    return this.extractResult(data);
  }
}

export default ApiLLMBaseService;
