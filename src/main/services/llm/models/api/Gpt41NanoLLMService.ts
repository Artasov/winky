import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt41NanoLLMService extends OpenAiLLMServiceBase {
  constructor(accessToken?: string) {
    super('gpt-4.1-nano', accessToken);
  }
}

export default Gpt41NanoLLMService;
