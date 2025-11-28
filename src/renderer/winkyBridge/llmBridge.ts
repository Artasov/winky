import {processLLM, processLLMStream} from '../services/winkyApi';

export const llmBridge = {
    process: (
        text: string,
        prompt: string,
        config: {mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string}
    ) => processLLM(text, prompt, config),
    processStream: (
        text: string,
        prompt: string,
        config: {mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string}
    ) => processLLMStream(text, prompt, config)
};

export type LlmBridge = typeof llmBridge;
