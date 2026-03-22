import {LLM_GEMINI_API_MODELS, LLM_LOCAL_MODELS, LLM_MODES, LLM_OPENAI_API_MODELS, LLM_WINKY_API_MODELS} from '@shared/constants';
import type {ChatProvider, LLMMode, WinkyChat} from '@shared/types';

const OPENAI_MODELS = new Set<string>([...LLM_OPENAI_API_MODELS]);
const GOOGLE_MODELS = new Set<string>([...LLM_GEMINI_API_MODELS]);
const WINKY_MODELS = new Set<string>([...LLM_WINKY_API_MODELS]);

export const getChatProvider = (mode: string | null | undefined, model: string | null | undefined): ChatProvider => {
    const resolvedMode = (mode || '').trim();
    const resolvedModel = (model || '').trim();
    if (resolvedMode !== LLM_MODES.API) {
        return 'local';
    }
    if (WINKY_MODELS.has(resolvedModel)) {
        return 'winky';
    }
    if (OPENAI_MODELS.has(resolvedModel)) {
        return 'openai';
    }
    if (GOOGLE_MODELS.has(resolvedModel)) {
        return 'google';
    }
    return 'local';
};

export const getChatProviderLabel = (chat: Pick<WinkyChat, 'storage' | 'provider'>): string | null => {
    if (chat.storage !== 'local') {
        return null;
    }
    return 'Local';
};

export const isLocalChat = (chat: Pick<WinkyChat, 'storage'> | null | undefined): boolean => chat?.storage === 'local';

export const createChatMeta = (mode: LLMMode, model: string) => ({
    storage: getChatProvider(mode, model) === 'winky' ? 'remote' : 'local' as const,
    provider: getChatProvider(mode, model),
    model_name: model,
    llm_mode: mode
});

export const getChatModelOptions = (provider: ChatProvider): string[] => {
    if (provider === 'winky') {
        return [...LLM_WINKY_API_MODELS];
    }
    if (provider === 'openai') {
        return [...LLM_OPENAI_API_MODELS];
    }
    if (provider === 'google') {
        return [...LLM_GEMINI_API_MODELS];
    }
    return [...LLM_LOCAL_MODELS];
};
