import type {BaseLLMService} from './BaseLLMService';
import type {LLMMode, LLMModel} from '@shared/types';
import {LLM_MODES} from '@shared/constants';
import {getLlmProvider} from '@shared/modelRegistry';

// API models
import OpenAiLLMService from './models/api/OpenAiLLMService';
import GeminiLLMService from './models/api/GeminiLLMService';
import WinkyHighLLMService from './models/api/WinkyHighLLMService';
import WinkyMidLLMService from './models/api/WinkyMidLLMService';
import WinkyLowLLMService from './models/api/WinkyLowLLMService';

// Local models
import GptOss120bLLMService from './models/local/GptOss120bLLMService';
import GptOss20bLLMService from './models/local/GptOss20bLLMService';
import Gemma327bLLMService from './models/local/Gemma327bLLMService';
import Gemma312bLLMService from './models/local/Gemma312bLLMService';
import Gemma34bLLMService from './models/local/Gemma34bLLMService';
import Gemma31bLLMService from './models/local/Gemma31bLLMService';
import DeepseekR18bLLMService from './models/local/DeepseekR18bLLMService';
import Qwen3Coder30bLLMService from './models/local/Qwen3Coder30bLLMService';
import Qwen330bLLMService from './models/local/Qwen330bLLMService';
import Qwen38bLLMService from './models/local/Qwen38bLLMService';
import Qwen34bLLMService from './models/local/Qwen34bLLMService';

interface LLMServiceOptions {
    openaiKey?: string;
    googleKey?: string;
    accessToken?: string;
}

export const createLLMService = (
    mode: LLMMode,
    model: LLMModel,
    options: LLMServiceOptions = {}
): BaseLLMService => {
    const requireOpenAIKey = () => {
        if (!options.openaiKey) {
            throw new Error('An OpenAI API key is required to use OpenAI models.');
        }
        return options.openaiKey;
    };

    if (mode === LLM_MODES.API) {
        const provider = getLlmProvider(model);
        if (provider === 'openai') {
            return new OpenAiLLMService(model, requireOpenAIKey());
        }
        if (provider === 'google') {
            if (!options.googleKey) {
                throw new Error('A Google AI API key is required to use Google Gemini models.');
            }
            return new GeminiLLMService(model, options.googleKey);
        }
        switch (model as string) {
            case 'winky-high':
                if (!options.accessToken) {
                    throw new Error('Authentication is required to use Winky models.');
                }
                return new WinkyHighLLMService(options.accessToken);
            case 'winky-mid':
                if (!options.accessToken) {
                    throw new Error('Authentication is required to use Winky models.');
                }
                return new WinkyMidLLMService(options.accessToken);
            case 'winky-low':
                if (!options.accessToken) {
                    throw new Error('Authentication is required to use Winky models.');
                }
                return new WinkyLowLLMService(options.accessToken);
            default:
                throw new Error(`Unknown API LLM model: ${model}`);
        }
    }

    switch (model as string) {
        case 'gpt-oss:120b':
            return new GptOss120bLLMService();
        case 'gpt-oss:20b':
            return new GptOss20bLLMService();
        case 'gemma3:27b':
            return new Gemma327bLLMService();
        case 'gemma3:12b':
            return new Gemma312bLLMService();
        case 'gemma3:4b':
            return new Gemma34bLLMService();
        case 'gemma3:1b':
            return new Gemma31bLLMService();
        case 'deepseek-r1:8b':
            return new DeepseekR18bLLMService();
        case 'qwen3-coder:30b':
            return new Qwen3Coder30bLLMService();
        case 'qwen3:30b':
            return new Qwen330bLLMService();
        case 'qwen3:8b':
            return new Qwen38bLLMService();
        case 'qwen3:4b':
            return new Qwen34bLLMService();
        default:
            throw new Error(`Unknown local LLM model: ${model}`);
    }
};
