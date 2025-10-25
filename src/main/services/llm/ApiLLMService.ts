import axios from 'axios';
import { LLM_PROCESS_ENDPOINT } from '@shared/constants';
import type { BaseLLMService } from './BaseLLMService';

export class ApiLLMService implements BaseLLMService {
  private accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  updateAccessToken(token?: string) {
    this.accessToken = token;
  }

  async process(text: string, prompt: string): Promise<string> {
    const response = await axios.post(
      LLM_PROCESS_ENDPOINT,
      { text, prompt },
      {
        headers: this.accessToken
          ? {
              Authorization: `Bearer ${this.accessToken}`
            }
          : undefined
      }
    );

    if (response.data?.result) {
      return response.data.result;
    }

    if (typeof response.data === 'string') {
      return response.data;
    }

    throw new Error('Не удалось получить ответ от LLM.');
  }
}

export default ApiLLMService;
