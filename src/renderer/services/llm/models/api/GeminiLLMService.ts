import ApiLLMBaseService from '../../bases/ApiLLMBaseService';

type GeminiResponsePart = {
    text?: string;
};

type GeminiCandidate = {
    content?: {
        parts?: GeminiResponsePart[];
    };
};

type GeminiResponsePayload = {
    candidates?: GeminiCandidate[];
    text?: string;
};

const extractGeminiText = (payload: unknown): string => {
    if (Array.isArray(payload)) {
        return payload.map((item) => extractGeminiText(item)).join('');
    }
    if (!payload || typeof payload !== 'object') {
        return '';
    }

    const typedPayload = payload as GeminiResponsePayload;
    const candidateText = typedPayload.candidates?.flatMap((candidate) => (
        candidate.content?.parts?.map((part) => part?.text ?? '') ?? []
    )).filter(Boolean).join('');

    if (candidateText) {
        return candidateText;
    }

    return typeof typedPayload.text === 'string' ? typedPayload.text : '';
};

const extractErrorMessage = async (response: Response): Promise<string> => {
    const raw = await response.text();
    if (!raw.trim()) {
        return `Gemini API returned ${response.status}.`;
    }
    try {
        const parsed = JSON.parse(raw);
        const message = parsed?.error?.message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
    } catch {
        // Ignore parse failures and return raw payload.
    }
    return raw;
};

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

    private buildStreamUrl(token: string): string {
        return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${token}&alt=sse`;
    }

    protected buildHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json'
        };
    }

    protected buildBody(text: string, prompt: string): Record<string, unknown> {
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
        const text = extractGeminiText(response).trim();
        if (text) {
            return text;
        }
        return super.extractResult(response);
    }

    async processStream(
        text: string,
        prompt: string,
        onChunk: (chunk: string) => void,
        options?: {signal?: AbortSignal}
    ): Promise<string> {
        const token = this.accessToken?.trim();
        if (!token) {
            throw new Error('Provide a Google AI API key to use this model.');
        }

        const response = await fetch(this.buildStreamUrl(token), {
            method: 'POST',
            headers: {
                ...this.buildHeaders(),
                Accept: 'text/event-stream'
            },
            body: JSON.stringify(this.buildBody(text, prompt)),
            signal: options?.signal
        });

        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }

        if (!response.body) {
            throw new Error('Gemini stream returned an empty body.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        const processLine = (line: string) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                return;
            }

            const data = trimmedLine.startsWith('data:')
                ? trimmedLine.slice(5).trim()
                : trimmedLine;

            if (!data || data === '[DONE]' || data === '[' || data === ']') {
                return;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(data);
            } catch {
                return;
            }

            const chunkText = extractGeminiText(parsed);
            if (!chunkText) {
                return;
            }

            const delta = chunkText.startsWith(fullText)
                ? chunkText.slice(fullText.length)
                : chunkText;

            if (!delta) {
                return;
            }

            if (chunkText.startsWith(fullText)) {
                fullText = chunkText;
            } else {
                fullText += delta;
            }

            onChunk(delta);
        };

        try {
            while (true) {
                const {done, value} = await reader.read();
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, {stream: true});

                while (true) {
                    const newlineIndex = buffer.indexOf('\n');
                    if (newlineIndex === -1) {
                        break;
                    }

                    let line = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 1);
                    if (line.endsWith('\r')) {
                        line = line.slice(0, -1);
                    }
                    processLine(line);
                }
            }

            const tail = buffer.trim();
            if (tail) {
                processLine(tail);
            }
        } finally {
            reader.releaseLock();
        }

        return fullText;
    }
}

export default GeminiLLMService;
