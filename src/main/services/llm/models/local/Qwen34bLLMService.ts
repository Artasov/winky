import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class Qwen34bLLMService extends OllamaLLMServiceBase {
    constructor() {
        super('qwen3:4b');
    }
}

export default Qwen34bLLMService;
