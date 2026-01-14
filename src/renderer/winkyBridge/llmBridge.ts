import {processLLM} from '../services/winkyApi';

export const llmBridge = {
    process: (
        text: string,
        prompt: string,
        config: {mode: string; model: string; openaiKey?: string; googleKey?: string; accessToken?: string},
        options?: { onChunk?: (chunk: string) => void }
    ) => processLLM(text, prompt, config, options)
};
