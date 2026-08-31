import type {BaseLLMService} from '../BaseLLMService';
import {getWsBaseUrl} from '@shared/constants';
import {winkyWebSocketAuthService} from '../../WinkyWebSocketAuthService';

const getWinkyAiLlmWsEndpoint = (): string => `${getWsBaseUrl()}/ws/ai/llm/`;

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

    async process(text: string, prompt: string, options?: {signal?: AbortSignal}): Promise<string> {
        let result = '';
        await this.processStream(text, prompt, (chunk) => {
            result += chunk;
        }, options);
        return result;
    }

    async processStream(
        text: string,
        prompt: string,
        onChunk: (chunk: string) => void,
        options?: {signal?: AbortSignal}
    ): Promise<string> {
        const ws = await winkyWebSocketAuthService.create(
            getWinkyAiLlmWsEndpoint(),
            options?.signal
        );
        return new Promise((resolve, reject) => {
            let fullContent = '';
            let resolved = false;

            const cleanup = () => {
                options?.signal?.removeEventListener('abort', handleAbort);
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    ws.close();
                }
            };

            const handleAbort = () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({action: 'cancel'}));
                }
                cleanup();
                if (!resolved) {
                    resolved = true;
                    reject(new DOMException('Aborted', 'AbortError'));
                }
            };

            ws.onopen = () => {
                if (resolved || options?.signal?.aborted) {
                    handleAbort();
                    return;
                }
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
                } catch (error) {
                    console.warn('[winky-llm] Invalid WebSocket event', {
                        errorType: error instanceof Error ? error.name : 'unknown'
                    });
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
                options?.signal?.removeEventListener('abort', handleAbort);
                if (!resolved) {
                    resolved = true;
                    if (event.code !== 1000) {
                        reject(new Error(`WebSocket closed: ${event.reason || event.code}`));
                    } else {
                        resolve(fullContent);
                    }
                }
            };

            options?.signal?.addEventListener('abort', handleAbort, {once: true});
            if (options?.signal?.aborted) handleAbort();
        });
    }
}

export default WinkyLLMServiceBase;
