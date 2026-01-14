import {listen} from '@tauri-apps/api/event';
import LocalLLMBaseService from './LocalLLMBaseService';
import {ollamaBridge} from '../../../winkyBridge/ollamaBridge';

export abstract class OllamaLLMServiceBase extends LocalLLMBaseService {
    protected constructor(model: string) {
        super(model);
        this.supportsStreaming = true;
    }

    protected buildEndpoint(): string {
        return '/v1/chat/completions';
    }

    async processStream(text: string, prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const messages = this.buildMessages(text, prompt);
        const streamId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        let fullText = '';
        const unlisten = await listen<{
            streamId?: string;
            delta?: string;
            done?: boolean;
        }>('ollama:stream', (event) => {
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
            const data = await ollamaBridge.chatCompletionsStream(this.model, messages, streamId);
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

export default OllamaLLMServiceBase;
