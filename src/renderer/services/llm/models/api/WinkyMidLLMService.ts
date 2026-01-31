import WinkyLLMServiceBase from '../../bases/WinkyLLMServiceBase';

export class WinkyMidLLMService extends WinkyLLMServiceBase {
    constructor(accessToken: string) {
        super('mid', accessToken);
    }
}

export default WinkyMidLLMService;
