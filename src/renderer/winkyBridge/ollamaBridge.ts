import {invoke} from '@tauri-apps/api/core';

export interface ChatMessage {
    role: string;
    content: string;
}

export const ollamaBridge = {
    checkInstalled: (): Promise<boolean> => invoke('ollama_check_installed'),
    isServerRunning: (): Promise<boolean> => invoke('ollama_is_server_running'),
    listModels: (_force?: boolean): Promise<string[]> => invoke('ollama_list_models'),
    chatCompletions: (model: string, messages: ChatMessage[]): Promise<any> =>
        invoke('ollama_chat_completions', {model, messages}),
    chatCompletionsStream: (model: string, messages: ChatMessage[], streamId: string): Promise<string> =>
        invoke('ollama_chat_completions_stream', {model, messages, streamId})
};
