import {invoke} from '@tauri-apps/api/core';

export const ollamaBridge = {
    checkInstalled: (): Promise<boolean> => invoke('ollama_check_installed'),
    listModels: (): Promise<string[]> => invoke('ollama_list_models'),
    pullModel: (model: string): Promise<void> => invoke('ollama_pull_model', {model}),
    warmupModel: (model: string): Promise<void> => invoke('ollama_warmup_model', {model})
};
