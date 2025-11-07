import LocalSpeechBaseService from '../../bases/LocalSpeechBaseService';

export class TinyTranscribeService extends LocalSpeechBaseService {
    constructor() {
        super('tiny');
    }
}

export default TinyTranscribeService;
