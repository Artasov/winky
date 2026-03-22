export interface BaseLLMService {
    process(text: string, prompt: string): Promise<string>;

    processStream?(
        text: string,
        prompt: string,
        onChunk: (chunk: string) => void,
        options?: {signal?: AbortSignal}
    ): Promise<string>;

    supportsStreaming?: boolean;
}
