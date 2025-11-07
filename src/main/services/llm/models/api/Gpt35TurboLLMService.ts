import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt35TurboLLMService extends OpenAiLLMServiceBase {
    constructor(accessToken?: string) {
        super('gpt-3.5-turbo', accessToken);
    }
}

export default Gpt35TurboLLMService;
