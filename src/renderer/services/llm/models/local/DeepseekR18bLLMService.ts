import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class DeepseekR18bLLMService extends OllamaLLMServiceBase {
    constructor() {
        super('deepseek-r1:8b');
    }
}

export default DeepseekR18bLLMService;
