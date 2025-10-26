import ApiLLMBaseService from './ApiLLMBaseService';

export abstract class OpenAiLLMServiceBase extends ApiLLMBaseService {
  protected constructor(model: string, accessToken?: string) {
    super(model, accessToken);
    this.supportsStreaming = true;
  }

  protected buildUrl(): string {
    return 'https://api.openai.com/v1/chat/completions';
  }

  protected buildBody(text: string, prompt: string): unknown {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text }
      ]
    };
  }
}

export default OpenAiLLMServiceBase;
