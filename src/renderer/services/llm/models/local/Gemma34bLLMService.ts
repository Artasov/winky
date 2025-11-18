import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class Gemma34bLLMService extends OllamaLLMServiceBase {
    constructor() {
        super('gemma3:4b');
    }
}

export default Gemma34bLLMService;
