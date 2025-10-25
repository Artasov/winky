import type { BaseLLMService } from './BaseLLMService';
import type { LLMModel, LLMMode } from '@shared/types';
import { LLM_MODES } from '@shared/constants';

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

export const createLLMService = (mode: LLMMode, model: LLMModel, accessToken?: string): BaseLLMService => {
  if (mode === LLM_MODES.API) {
    switch (model) {
      case 'o4-mini':
        return new O4MiniLLMService(accessToken);
      case 'gpt-4.1-mini':
        return new Gpt41MiniLLMService(accessToken);
      case 'gpt-4.1-nano':
        return new Gpt41NanoLLMService(accessToken);
      case 'o3-mini':
        return new O3MiniLLMService(accessToken);
      case 'o1-mini':
        return new O1MiniLLMService(accessToken);
      case 'gpt-4o-mini':
        return new Gpt4oMiniLLMService(accessToken);
      case 'gpt-4-turbo':
        return new Gpt4TurboLLMService(accessToken);
      case 'chatgpt-4o-latest':
        return new ChatGpt4oLatestLLMService(accessToken);
      case 'gpt-3.5-turbo':
        return new Gpt35TurboLLMService(accessToken);
      case 'gpt-5':
        return new Gpt5LLMService(accessToken);
      case 'gpt-5-nano':
        return new Gpt5NanoLLMService(accessToken);
      case 'gpt-5-mini':
        return new Gpt5MiniLLMService(accessToken);
      default:
        throw new Error(`Неизвестная API LLM модель: ${model}`);
    }
  }

  switch (model) {
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
      throw new Error(`Неизвестная локальная LLM модель: ${model}`);
  }
};

export default createLLMService;
