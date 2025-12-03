import {invoke} from '@tauri-apps/api/core';

export interface ChatMessage {
    role: string;
    content: string;
}

export const ollamaBridge = {
    checkInstalled: (): Promise<boolean> => invoke('ollama_check_installed'),
    listModels: (_force?: boolean): Promise<string[]> => invoke('ollama_list_models'),
    chatCompletions: (model: string, messages: ChatMessage[]): Promise<any> =>
        invoke('ollama_chat_completions', {model, messages})
};
