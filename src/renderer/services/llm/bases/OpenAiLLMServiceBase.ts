import ApiLLMBaseService from './ApiLLMBaseService';

type OpenAiChatCompletionChunk = {
    choices?: Array<{
        delta?: {
            content?: string | Array<{text?: string}>;
        };
    }>;
};

const extractChunkText = (payload: OpenAiChatCompletionChunk): string => {
    const content = payload.choices?.[0]?.delta?.content;
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((item) => item?.text ?? '')
            .filter(Boolean)
            .join('');
    }
    return '';
};

const extractErrorMessage = async (response: Response): Promise<string> => {
    const raw = await response.text();
    if (!raw.trim()) {
        return `OpenAI API returned ${response.status}.`;
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

export abstract class OpenAiLLMServiceBase extends ApiLLMBaseService {
    protected constructor(model: string, accessToken?: string) {
        super(model, accessToken);
        this.supportsStreaming = true;
    }

    protected buildUrl(): string {
        return 'https://api.openai.com/v1/chat/completions';
    }

    protected buildBody(text: string, prompt: string): Record<string, unknown> {
        const messages: Array<{role: 'system' | 'user'; content: string}> = [];
        const trimmedPrompt = prompt.trim();
        const trimmedText = text.trim();

        if (trimmedPrompt) {
            messages.push({role: 'system', content: trimmedPrompt});
        }
        messages.push({role: 'user', content: trimmedText});

        return {
            model: this.model,
            messages
        };
    }

    private getHeaders(token: string): HeadersInit {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        };
    }

    async process(text: string, prompt: string): Promise<string> {
        const token = this.accessToken?.trim();
        if (!token) {
            throw new Error('An OpenAI API key is required to use OpenAI models.');
        }

        const response = await fetch(this.buildUrl(), {
            method: 'POST',
            headers: this.getHeaders(token),
            body: JSON.stringify(this.buildBody(text, prompt))
        });

        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }

        const data = await response.json();
        return this.extractResult(data);
    }

    async processStream(text: string, prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const token = this.accessToken?.trim();
        if (!token) {
            throw new Error('An OpenAI API key is required to use OpenAI models.');
        }

        const response = await fetch(this.buildUrl(), {
            method: 'POST',
            headers: this.getHeaders(token),
            body: JSON.stringify({...this.buildBody(text, prompt), stream: true})
        });

        if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
        }

        if (!response.body) {
            throw new Error('OpenAI stream returned an empty body.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

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

                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data:')) {
                        continue;
                    }

                    const data = trimmedLine.slice(5).trim();
                    if (!data || data === '[DONE]') {
                        continue;
                    }

                    let parsed: OpenAiChatCompletionChunk;
                    try {
                        parsed = JSON.parse(data) as OpenAiChatCompletionChunk;
                    } catch {
                        continue;
                    }

                    const chunk = extractChunkText(parsed);
                    if (!chunk) {
                        continue;
                    }

                    fullText += chunk;
                    onChunk(chunk);
                }
            }

            const tail = buffer.trim();
            if (tail.startsWith('data:')) {
                const data = tail.slice(5).trim();
                if (data && data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data) as OpenAiChatCompletionChunk;
                        const chunk = extractChunkText(parsed);
                        if (chunk) {
                            fullText += chunk;
                            onChunk(chunk);
                        }
                    } catch {
                        // Ignore invalid tail payload.
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return fullText;
    }
}

export default OpenAiLLMServiceBase;
