import OpenAiSpeechServiceBase from '../../bases/OpenAiSpeechServiceBase';

export class Gpt4oTranscribeService extends OpenAiSpeechServiceBase {
  constructor(accessToken?: string) {
    super('gpt-4o-transcribe', accessToken);
  }
}

export default Gpt4oTranscribeService;
