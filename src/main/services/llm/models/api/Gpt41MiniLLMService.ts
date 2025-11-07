import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt41MiniLLMService extends OpenAiLLMServiceBase {
    constructor(accessToken?: string) {
        super('gpt-4.1-mini', accessToken);
    }
}

export default Gpt41MiniLLMService;
