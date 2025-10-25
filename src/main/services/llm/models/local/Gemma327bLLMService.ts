import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class Gemma327bLLMService extends OllamaLLMServiceBase {
  constructor() {
    super('gemma3:27b');
  }
}

export default Gemma327bLLMService;
