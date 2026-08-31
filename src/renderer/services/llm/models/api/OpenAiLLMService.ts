import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class OpenAiLLMService extends OpenAiLLMServiceBase {
    constructor(model: string, apiKey: string) {
        super(model, apiKey);
    }
}

export default OpenAiLLMService;
