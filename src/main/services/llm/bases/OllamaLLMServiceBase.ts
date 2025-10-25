import LocalLLMBaseService from './LocalLLMBaseService';

export abstract class OllamaLLMServiceBase extends LocalLLMBaseService {
  protected constructor(model: string) {
    super(model);
  }

  protected buildEndpoint(): string {
    return '/v1/chat/completions';
  }
}

export default OllamaLLMServiceBase;
