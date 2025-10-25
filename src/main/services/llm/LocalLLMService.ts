import type { BaseLLMService } from './BaseLLMService';

export class LocalLLMService implements BaseLLMService {
  async process(text: string, prompt: string): Promise<string> {
    return `Local processing not implemented. Prompt: ${prompt}. Input: ${text}`;
  }
}

export default LocalLLMService;
