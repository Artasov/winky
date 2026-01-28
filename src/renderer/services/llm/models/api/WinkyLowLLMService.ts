import WinkyLLMServiceBase from '../../bases/WinkyLLMServiceBase';

export class WinkyLowLLMService extends WinkyLLMServiceBase {
    constructor(accessToken: string) {
        super('low', accessToken);
    }
}

export default WinkyLowLLMService;
