import LocalSpeechBaseService from '../../bases/LocalSpeechBaseService';

export class LargeTranscribeService extends LocalSpeechBaseService {
    constructor() {
        super('large');
    }
}

export default LargeTranscribeService;
