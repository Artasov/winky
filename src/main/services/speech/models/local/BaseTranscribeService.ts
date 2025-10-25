import LocalSpeechBaseService from '../../bases/LocalSpeechBaseService';

export class BaseTranscribeService extends LocalSpeechBaseService {
  constructor() {
    super('base');
  }
}

export default BaseTranscribeService;
