import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt4TurboLLMService extends OpenAiLLMServiceBase {
    constructor(accessToken?: string) {
        super('gpt-4-turbo', accessToken);
    }
}

export default Gpt4TurboLLMService;
