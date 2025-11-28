import {
    LLM_GEMINI_API_MODELS,
    LLM_OPENAI_API_MODELS,
    SPEECH_GOOGLE_API_MODELS,
    SPEECH_OPENAI_API_MODELS
} from '@shared/constants';
import type {LLMModel, TranscribeModel} from '@shared/types';
import {normalizeOllamaModelName} from '../services/ollama';
import {getLocalSpeechModelMetadata} from '../services/localSpeechModels';

const OPENAI_API_MODEL_SET = new Set<string>([...LLM_OPENAI_API_MODELS]);
const GEMINI_API_MODEL_SET = new Set<string>([...LLM_GEMINI_API_MODELS]);
const OPENAI_TRANSCRIBE_MODEL_SET = new Set<string>([...SPEECH_OPENAI_API_MODELS]);
const GOOGLE_TRANSCRIBE_MODEL_SET = new Set<string>([...SPEECH_GOOGLE_API_MODELS]);

const LOCAL_LLM_SIZE_HINTS: Record<string, string> = {
    'gpt-oss:120b': '≈90 GB',
    'gpt-oss:20b': '≈13 GB',
    'gemma3:27b': '≈21 GB',
    'gemma3:12b': '≈9.5 GB',
    'gemma3:4b': '≈2.2 GB',
    'gemma3:1b': '≈815 MB',
    'deepseek-r1:8b': '≈5.5 GB',
    'qwen3-coder:30b': '≈23 GB',
    'qwen3:30b': '≈23 GB',
    'qwen3:8b': '≈5.2 GB',
    'qwen3:4b': '≈2.5 GB'
};

export const isGeminiApiModel = (model: LLMModel): boolean => GEMINI_API_MODEL_SET.has(model as string);
export const isOpenAiApiModel = (model: LLMModel): boolean => OPENAI_API_MODEL_SET.has(model as string);
export const isOpenAiTranscribeModel = (model: TranscribeModel): boolean => OPENAI_TRANSCRIBE_MODEL_SET.has(model as string);
export const isGoogleTranscribeModel = (model: TranscribeModel): boolean => GOOGLE_TRANSCRIBE_MODEL_SET.has(model as string);

export const formatLabel = (value: string): string =>
    value
        .replace(/[:]/g, ' ')
        .replace(/-/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

export const formatLLMLabel = (value: string): string => {
    const base = formatLabel(value);
    if (isGeminiApiModel(value as LLMModel)) {
        return `Google ${base}`;
    }
    if (isOpenAiApiModel(value as LLMModel)) {
        return `OpenAI ${base}`;
    }
    const normalized = normalizeOllamaModelName(value);
    const size = LOCAL_LLM_SIZE_HINTS[normalized];
    if (size) {
        return `${base} · ${size}`;
    }
    return base;
};

export const formatTranscribeLabel = (value: string): string => {
    const localMeta = getLocalSpeechModelMetadata(value);
    if (localMeta) {
        return `${localMeta.label} · ${localMeta.size}`;
    }
    const base = formatLabel(value);
    if (isGoogleTranscribeModel(value as TranscribeModel)) {
        return `Google ${base}`;
    }
    if (isOpenAiTranscribeModel(value as TranscribeModel)) {
        return `OpenAI ${base}`;
    }
    return base;
};
