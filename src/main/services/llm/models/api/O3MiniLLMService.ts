import OpenAiLLMServiceBase from '../../bases/OpenAiLLMServiceBase';

export class O3MiniLLMService extends OpenAiLLMServiceBase {
  constructor(accessToken?: string) {
    super('o3-mini', accessToken);
  }
}

export default O3MiniLLMService;
