import LocalSpeechBaseService from '../../bases/LocalSpeechBaseService';

export class LargeV3TranscribeService extends LocalSpeechBaseService {
    constructor() {
        super('large-v3');
    }
}

export default LargeV3TranscribeService;
