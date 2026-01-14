import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import ApiLLMBaseService from '../../bases/ApiLLMBaseService';

class GeminiLLMService extends ApiLLMBaseService {
    constructor(model: string, apiKey?: string) {
        super(model, apiKey);
        this.supportsStreaming = true;
    }

    protected buildUrl(): string {
        if (!this.accessToken) {
        throw new Error('Provide a Google AI API key to use this model.');
        }
        return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.accessToken}`;
    }

    protected buildHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json'
        };
    }

    protected buildBody(text: string, prompt: string): unknown {
        const trimmedPrompt = prompt?.trim();
        const trimmedText = text?.trim();
        const body: Record<string, unknown> = {
            contents: [
                {
                    role: 'user',
                    parts: trimmedText ? [{text: trimmedText}] : [{text: ''}]
                }
            ]
        };

        if (trimmedPrompt) {
            body.systemInstruction = {
                role: 'system',
                parts: [{text: trimmedPrompt}]
            };
        }

        return body;
    }

    protected extractResult(response: any): string {
        const candidates = response?.candidates;
        if (Array.isArray(candidates) && candidates.length > 0) {
            const parts = candidates[0]?.content?.parts;
            if (Array.isArray(parts)) {
                const text = parts
                    .map((part) => part?.text ?? '')
                    .filter(Boolean)
                    .join('\n')
                    .trim();
                if (text) {
                    return text;
                }
            }
        }
        return super.extractResult(response);
    }

    async processStream(text: string, prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const token = this.accessToken?.trim();
        if (!token) {
            throw new Error('Provide a Google AI API key to use this model.');
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
        }>('gemini:stream', (event) => {
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
            const data = await invoke<string>('gemini_generate_content_stream', {
                apiKey: token,
                model: this.model,
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

export default GeminiLLMService;
