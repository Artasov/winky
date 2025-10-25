import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class Gemma31bLLMService extends OllamaLLMServiceBase {
  constructor() {
    super('gemma3:1b');
  }
}

export default Gemma31bLLMService;
