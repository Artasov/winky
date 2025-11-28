import {invoke} from '@tauri-apps/api/core';

export const ollamaBridge = {
    checkInstalled: (): Promise<boolean> => invoke('ollama_check_installed'),
    listModels: (): Promise<string[]> => invoke('ollama_list_models')
};
