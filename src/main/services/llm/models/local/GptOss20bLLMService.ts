import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class GptOss20bLLMService extends OllamaLLMServiceBase {
  constructor() {
    super('gpt-oss:20b');
  }
}

export default GptOss20bLLMService;
