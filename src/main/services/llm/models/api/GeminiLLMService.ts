import ApiLLMBaseService from '../../bases/ApiLLMBaseService';

class GeminiLLMService extends ApiLLMBaseService {
    constructor(model: string, apiKey?: string) {
        super(model, apiKey);
        this.supportsStreaming = false;
    }

    protected buildUrl(): string {
        if (!this.accessToken) {
            throw new Error('Укажите Gemini API Key для использования этой модели.');
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
}

export default GeminiLLMService;
