export type LLMProcessOptions = {signal?: AbortSignal};

export interface BaseLLMService {
    process(text: string, prompt: string, options?: LLMProcessOptions): Promise<string>;

    processStream?(
        text: string,
        prompt: string,
        onChunk: (chunk: string) => void,
        options?: LLMProcessOptions
    ): Promise<string>;

    supportsStreaming?: boolean;
}
