import LocalSpeechBaseService from '../../bases/LocalSpeechBaseService';

export class LargeV2TranscribeService extends LocalSpeechBaseService {
  constructor() {
    super('large-v2');
  }
}

export default LargeV2TranscribeService;
