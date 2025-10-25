import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class Gemma312bLLMService extends OllamaLLMServiceBase {
  constructor() {
    super('gemma3:12b');
  }
}

export default Gemma312bLLMService;
