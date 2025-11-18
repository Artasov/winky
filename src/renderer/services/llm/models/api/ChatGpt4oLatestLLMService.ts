import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class ChatGpt4oLatestLLMService extends OpenAiLLMServiceBase {
    constructor(accessToken?: string) {
        super('chatgpt-4o-latest', accessToken);
    }
}

export default ChatGpt4oLatestLLMService;
