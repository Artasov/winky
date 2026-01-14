import type {BaseLLMService} from '../BaseLLMService';
import {ollamaBridge, type ChatMessage} from '../../../winkyBridge/ollamaBridge';

export abstract class LocalLLMBaseService implements BaseLLMService {
    protected readonly model: string;
    public supportsStreaming: boolean = false;

    protected constructor(model: string) {
        this.model = model;
    }

    protected abstract buildEndpoint(): string;

    protected buildMessages(text: string, prompt: string): ChatMessage[] {
        return [
            {role: 'system', content: prompt},
            {role: 'user', content: text}
        ];
    }

    protected extractResult(response: any): string {
        if (!response) {
            throw new Error('Empty response from the local model.');
        }
        if (typeof response === 'string') {
            return response;
        }
        if (response.message?.content) {
            if (Array.isArray(response.message.content)) {
                return response.message.content.map((item: any) => item?.text ?? '').join('\n');
            }
            return response.message.content;
        }
        if (response.choices?.length) {
            return response.choices[0]?.message?.content ?? '';
        }
        return JSON.stringify(response);
    }

    async process(text: string, prompt: string): Promise<string> {
        const messages = this.buildMessages(text, prompt);
        const data = await ollamaBridge.chatCompletions(this.model, messages);
        return this.extractResult(data);
    }
}

export default LocalLLMBaseService;
