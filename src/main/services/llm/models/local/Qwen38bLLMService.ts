import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class Qwen38bLLMService extends OllamaLLMServiceBase {
    constructor() {
        super('qwen3:8b');
    }
}

export default Qwen38bLLMService;
