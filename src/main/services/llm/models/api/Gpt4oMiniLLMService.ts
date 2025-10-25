import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class Gpt4oMiniLLMService extends OpenAiLLMServiceBase {
  constructor(accessToken?: string) {
    super('gpt-4o-mini', accessToken);
  }
}

export default Gpt4oMiniLLMService;
