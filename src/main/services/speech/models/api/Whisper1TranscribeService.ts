import OpenAiSpeechServiceBase from '../../bases/OpenAiSpeechServiceBase';

export class Whisper1TranscribeService extends OpenAiSpeechServiceBase {
  constructor(accessToken?: string) {
    super('whisper-1', accessToken);
  }
}

export default Whisper1TranscribeService;
