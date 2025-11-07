import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt5LLMService extends OpenAiLLMServiceBase {
    constructor(accessToken?: string) {
        super('gpt-5', accessToken);
    }
}

export default Gpt5LLMService;
