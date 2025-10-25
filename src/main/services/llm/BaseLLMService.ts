export interface BaseLLMService {
  process(text: string, prompt: string): Promise<string>;
}
