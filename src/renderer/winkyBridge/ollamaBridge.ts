import {invoke} from '@tauri-apps/api/core';

export interface ChatMessage {
    role: string;
    content: string;
}

const createRequestId = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const invokeWithSignal = <T>(
    command: string,
    args: Record<string, unknown>,
    requestId: string,
    signal?: AbortSignal
): Promise<T> => {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

    const request = invoke<T>(command, {...args, requestId});
    if (!signal) return request;

    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const handleAbort = () => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', handleAbort);
            void invoke<void>('ollama_cancel_request', {requestId}).catch((error) => {
                console.warn('[Ollama] Failed to cancel native request', {requestId, error});
            });
            reject(new DOMException('Aborted', 'AbortError'));
        };

        signal.addEventListener('abort', handleAbort, {once: true});
        request.then(
            (value) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', handleAbort);
                resolve(value);
            },
            (error) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', handleAbort);
                reject(signal.aborted ? new DOMException('Aborted', 'AbortError') : error);
            }
        );
    });
};

export const ollamaBridge = {
    checkInstalled: (): Promise<boolean> => invoke('ollama_check_installed'),
    isServerRunning: (): Promise<boolean> => invoke('ollama_is_server_running'),
    listModels: (_force?: boolean): Promise<string[]> => invoke('ollama_list_models'),
    chatCompletions: (model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<any> => {
        const requestId = createRequestId();
        return invokeWithSignal('ollama_chat_completions', {model, messages}, requestId, signal);
    },
    chatCompletionsStream: (
        model: string,
        messages: ChatMessage[],
        streamId: string,
        signal?: AbortSignal
    ): Promise<string> => invokeWithSignal(
        'ollama_chat_completions_stream',
        {model, messages, streamId},
        streamId,
        signal
    )
};
