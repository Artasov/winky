import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt5MiniLLMService extends OpenAiLLMServiceBase {
  constructor(accessToken?: string) {
    super('gpt-5-mini', accessToken);
  }
}

export default Gpt5MiniLLMService;
