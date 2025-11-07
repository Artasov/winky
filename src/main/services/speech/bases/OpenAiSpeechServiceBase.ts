import ApiSpeechBaseService from './ApiSpeechBaseService';

export abstract class OpenAiSpeechServiceBase extends ApiSpeechBaseService {
    protected constructor(model: string, accessToken?: string) {
        super(model, accessToken);
    }

    protected getEndpoint(): string {
        return 'https://api.openai.com/v1/audio/transcriptions';
    }
}

export default OpenAiSpeechServiceBase;
