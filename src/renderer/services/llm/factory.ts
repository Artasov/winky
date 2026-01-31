import type {BaseLLMService} from './BaseLLMService';
import type {LLMMode, LLMModel} from '@shared/types';
import {LLM_MODES} from '@shared/constants';

// API models
import O4MiniLLMService from './models/api/O4MiniLLMService';
import Gpt41MiniLLMService from './models/api/Gpt41MiniLLMService';
import Gpt41NanoLLMService from './models/api/Gpt41NanoLLMService';
import O3MiniLLMService from './models/api/O3MiniLLMService';
import O1MiniLLMService from './models/api/O1MiniLLMService';
import Gpt4oMiniLLMService from './models/api/Gpt4oMiniLLMService';
import Gpt4TurboLLMService from './models/api/Gpt4TurboLLMService';
import ChatGpt4oLatestLLMService from './models/api/ChatGpt4oLatestLLMService';
import Gpt35TurboLLMService from './models/api/Gpt35TurboLLMService';
import Gpt5LLMService from './models/api/Gpt5LLMService';
import Gpt5NanoLLMService from './models/api/Gpt5NanoLLMService';
import Gpt5MiniLLMService from './models/api/Gpt5MiniLLMService';
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
            case 'o4-mini':
                return new O4MiniLLMService(requireOpenAIKey());
            case 'gpt-4.1-mini':
                return new Gpt41MiniLLMService(requireOpenAIKey());
            case 'gpt-4.1-nano':
                return new Gpt41NanoLLMService(requireOpenAIKey());
            case 'o3-mini':
                return new O3MiniLLMService(requireOpenAIKey());
            case 'o1-mini':
                return new O1MiniLLMService(requireOpenAIKey());
            case 'gpt-4o-mini':
                return new Gpt4oMiniLLMService(requireOpenAIKey());
            case 'gpt-4-turbo':
                return new Gpt4TurboLLMService(requireOpenAIKey());
            case 'chatgpt-4o-latest':
                return new ChatGpt4oLatestLLMService(requireOpenAIKey());
            case 'gpt-3.5-turbo':
                return new Gpt35TurboLLMService(requireOpenAIKey());
            case 'gpt-5':
                return new Gpt5LLMService(requireOpenAIKey());
            case 'gpt-5-nano':
                return new Gpt5NanoLLMService(requireOpenAIKey());
            case 'gpt-5-mini':
                return new Gpt5MiniLLMService(requireOpenAIKey());
            case 'gemini-3.0-pro':
            case 'gemini-3.0-flash':
            case 'gemini-2.5-pro':
            case 'gemini-2.5-flash':
            case 'gemini-2.0-pro':
            case 'gemini-2.0-flash':
            case 'gemini-1.5-pro':
            case 'gemini-1.5-flash':
            case 'gemini-1.0-pro':
                if (!options.googleKey) {
                    throw new Error('A Google AI API key is required to use Google Gemini models.');
                }
                return new GeminiLLMService(model, options.googleKey);
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
