import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import ApiLLMBaseService from './ApiLLMBaseService';

export abstract class OpenAiLLMServiceBase extends ApiLLMBaseService {
    protected constructor(model: string, accessToken?: string) {
        super(model, accessToken);
        this.supportsStreaming = true;
    }

    protected buildUrl(): string {
        return 'https://api.openai.com/v1/chat/completions';
    }

    protected buildBody(text: string, prompt: string): unknown {
        return {
            model: this.model,
            messages: [
                {role: 'system', content: prompt},
                {role: 'user', content: text}
            ]
        };
    }

    async process(text: string, prompt: string): Promise<string> {
        const token = this.accessToken?.trim();
        if (!token) {
            throw new Error('An OpenAI API key is required to use OpenAI models.');
        }

        const body = this.buildBody(text, prompt);
        const data = await invoke('openai_chat_completions', {apiKey: token, body});
        return this.extractResult(data);
    }

    async processStream(text: string, prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const token = this.accessToken?.trim();
        if (!token) {
            throw new Error('An OpenAI API key is required to use OpenAI models.');
        }

        const body = this.buildBody(text, prompt);
        const streamId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        let fullText = '';
        const unlisten = await listen<{
            streamId?: string;
            delta?: string;
            done?: boolean;
        }>('openai:stream', (event) => {
            const payload = event.payload;
            if (!payload || payload.streamId !== streamId) {
                return;
            }
            if (typeof payload.delta === 'string' && payload.delta.length > 0) {
                fullText += payload.delta;
                onChunk(payload.delta);
            }
        });

        try {
            const data = await invoke<string>('openai_chat_completions_stream', {
                apiKey: token,
                body,
                streamId
            });
            if (typeof data === 'string' && data.length > fullText.length) {
                const tail = data.slice(fullText.length);
                if (tail) {
                    fullText = data;
                    onChunk(tail);
                }
            }
            return typeof data === 'string' ? data : fullText;
        } finally {
            unlisten();
        }
    }
}

export default OpenAiLLMServiceBase;
