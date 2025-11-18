import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class O1MiniLLMService extends OpenAiLLMServiceBase {
    constructor(accessToken?: string) {
        super('o1-mini', accessToken);
    }
}

export default O1MiniLLMService;
