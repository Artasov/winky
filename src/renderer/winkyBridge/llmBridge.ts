import {processLLM} from '../services/winkyApi';

export const llmBridge = {
    process: (
        text: string,
        prompt: string,
        config: {mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string}
    ) => processLLM(text, prompt, config)
};
