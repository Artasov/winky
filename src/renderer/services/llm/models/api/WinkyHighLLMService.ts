import WinkyLLMServiceBase from '../../bases/WinkyLLMServiceBase';

export class WinkyHighLLMService extends WinkyLLMServiceBase {
    constructor(accessToken: string) {
        super('high', accessToken);
    }
}

export default WinkyHighLLMService;
