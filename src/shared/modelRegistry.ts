import {
    LLM_MODES,
    LLM_GEMINI_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_OPENAI_API_MODELS,
    LLM_WINKY_API_MODELS,
    SPEECH_GOOGLE_API_MODELS,
    SPEECH_MODES,
    SPEECH_LOCAL_MODELS,
    SPEECH_OPENAI_API_MODELS,
    SPEECH_WINKY_API_MODELS
} from './constants';
import type {LLMMode, TranscribeMode} from './types';

export type ModelProvider = 'winky' | 'openai' | 'google' | 'local';
export type ModelCapability = 'llm' | 'transcription';
export type ModelStatus = 'stable' | 'preview';

export interface ModelMetadata {
    id: string;
    provider: ModelProvider;
    capability: ModelCapability;
    status: ModelStatus;
    needsAccount: boolean;
    needsApiKey: boolean;
}

const OPENAI_LLM_MODELS = new Set<string>(LLM_OPENAI_API_MODELS);
const GOOGLE_LLM_MODELS = new Set<string>(LLM_GEMINI_API_MODELS);
const WINKY_LLM_MODELS = new Set<string>(LLM_WINKY_API_MODELS);
const LOCAL_LLM_MODELS = new Set<string>(LLM_LOCAL_MODELS);
const OPENAI_SPEECH_MODELS = new Set<string>(SPEECH_OPENAI_API_MODELS);
const GOOGLE_SPEECH_MODELS = new Set<string>(SPEECH_GOOGLE_API_MODELS);
const WINKY_SPEECH_MODELS = new Set<string>(SPEECH_WINKY_API_MODELS);
const LOCAL_SPEECH_MODELS = new Set<string>(SPEECH_LOCAL_MODELS);
const PREVIEW_MODELS = new Set<string>(['gemini-3.1-pro-preview']);

export const getLlmProvider = (model: string): ModelProvider | null => {
    if (WINKY_LLM_MODELS.has(model)) return 'winky';
    if (OPENAI_LLM_MODELS.has(model)) return 'openai';
    if (GOOGLE_LLM_MODELS.has(model)) return 'google';
    if (LOCAL_LLM_MODELS.has(model)) return 'local';
    return null;
};

export const getTranscriptionProvider = (model: string): ModelProvider | null => {
    if (WINKY_SPEECH_MODELS.has(model)) return 'winky';
    if (OPENAI_SPEECH_MODELS.has(model)) return 'openai';
    if (GOOGLE_SPEECH_MODELS.has(model)) return 'google';
    if (LOCAL_SPEECH_MODELS.has(model)) return 'local';
    return null;
};

export const getModelMetadata = (model: string, capability: ModelCapability): ModelMetadata | null => {
    const provider = capability === 'llm'
        ? getLlmProvider(model)
        : getTranscriptionProvider(model);
    if (!provider) return null;
    return {
        id: model,
        provider,
        capability,
        status: PREVIEW_MODELS.has(model) ? 'preview' : 'stable',
        needsAccount: provider === 'winky',
        needsApiKey: provider === 'openai' || provider === 'google'
    };
};

export const isKnownLlmModel = (model: string): boolean => getLlmProvider(model) !== null;
export const isKnownTranscriptionModel = (model: string): boolean => getTranscriptionProvider(model) !== null;

export const isLlmModelCompatible = (mode: LLMMode, model: string): boolean => {
    const provider = getLlmProvider(model);
    return mode === LLM_MODES.LOCAL ? provider === 'local' : provider !== null && provider !== 'local';
};

export const isTranscriptionModelCompatible = (mode: TranscribeMode, model: string): boolean => {
    const provider = getTranscriptionProvider(model);
    return mode === SPEECH_MODES.LOCAL ? provider === 'local' : provider !== null && provider !== 'local';
};
