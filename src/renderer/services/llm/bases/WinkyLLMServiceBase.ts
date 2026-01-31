import type {BaseLLMService} from '../BaseLLMService';
import {WS_BASE_URL} from '@shared/constants';

const WINKY_AI_LLM_WS_ENDPOINT = `${WS_BASE_URL}/ws/ai/llm/`;

type AIWSEvent =
    | {event: 'start'; chat_id: string; user_message_id: string; model_level: string}
    | {event: 'delta'; text: string; chat_id: string; message_id: string; model_level: string}
    | {event: 'done'; chat_id: string; message_id: string; model_level: string; credits: string}
    | {event: 'cancelled'}
    | {event: 'error'; code: string; message: string};

export abstract class WinkyLLMServiceBase implements BaseLLMService {
    protected readonly modelLevel: 'low' | 'mid' | 'high';
    protected readonly accessToken: string;
    public supportsStreaming: boolean = true;

    protected constructor(modelLevel: 'low' | 'mid' | 'high', accessToken: string) {
        this.modelLevel = modelLevel;
        this.accessToken = accessToken;
    }

    async process(text: string, prompt: string): Promise<string> {
        let result = '';
        await this.processStream(text, prompt, (chunk) => {
            result += chunk;
        });
        return result;
    }

    async processStream(text: string, prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        return new Promise((resolve, reject) => {
            const wsUrl = `${WINKY_AI_LLM_WS_ENDPOINT}?token=${this.accessToken}`;
            const ws = new WebSocket(wsUrl);

            let fullContent = '';
            let resolved = false;

            const cleanup = () => {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    ws.close();
                }
            };

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    action: 'generate',
                    prompt: `${prompt}\n\n${text}`.trim(),
                    model_level: this.modelLevel
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const data: AIWSEvent = JSON.parse(event.data);

                    switch (data.event) {
                        case 'delta':
                            fullContent += data.text;
                            onChunk(data.text);
                            break;

                        case 'done':
                            cleanup();
                            if (!resolved) {
                                resolved = true;
                                resolve(fullContent);
                            }
                            break;

                        case 'cancelled':
                            cleanup();
                            if (!resolved) {
                                resolved = true;
                                reject(new Error('Generation cancelled'));
                            }
                            break;

                        case 'error':
                            cleanup();
                            if (!resolved) {
                                resolved = true;
                                const error = new Error(data.message);
                                (error as any).code = data.code;
                                (error as any).isCreditsError = data.code === 'not_enough_credits' || data.code === '402';
                                reject(error);
                            }
                            break;
                    }
                } catch {
                    // Skip invalid JSON
                }
            };

            ws.onerror = () => {
                cleanup();
                if (!resolved) {
                    resolved = true;
                    reject(new Error('WebSocket connection error'));
                }
            };

            ws.onclose = (event) => {
                if (!resolved) {
                    resolved = true;
                    if (event.code !== 1000) {
                        reject(new Error(`WebSocket closed: ${event.reason || event.code}`));
                    } else {
                        resolve(fullContent);
                    }
                }
            };
        });
    }
}

export default WinkyLLMServiceBase;
