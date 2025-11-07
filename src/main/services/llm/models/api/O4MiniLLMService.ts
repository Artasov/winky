import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class O4MiniLLMService extends OpenAiLLMServiceBase {
    constructor(accessToken?: string) {
        super('o4-mini', accessToken);
    }
}

export default O4MiniLLMService;
