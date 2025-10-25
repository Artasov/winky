import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt5NanoLLMService extends OpenAiLLMServiceBase {
  constructor(accessToken?: string) {
    super('gpt-5-nano', accessToken);
  }
}

export default Gpt5NanoLLMService;
