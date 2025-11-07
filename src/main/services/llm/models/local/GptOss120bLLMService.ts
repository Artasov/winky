import OllamaLLMServiceBase from '../../bases/OllamaLLMServiceBase';

export class GptOss120bLLMService extends OllamaLLMServiceBase {
    constructor() {
        super('gpt-oss:120b');
    }
}

export default GptOss120bLLMService;
