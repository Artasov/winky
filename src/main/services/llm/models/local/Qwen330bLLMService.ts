import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class Qwen330bLLMService extends OllamaLLMServiceBase {
  constructor() {
    super('qwen3:30b');
  }
}

export default Qwen330bLLMService;
