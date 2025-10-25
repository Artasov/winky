import OpenAiSpeechServiceBase from '../../bases/OpenAiSpeechServiceBase';

export class Gpt4oMiniTranscribeService extends OpenAiSpeechServiceBase {
  constructor(accessToken?: string) {
    super('gpt-4o-mini-transcribe', accessToken);
  }
}

export default Gpt4oMiniTranscribeService;
