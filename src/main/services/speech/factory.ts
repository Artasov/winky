import type { BaseSpeechService } from './BaseSpeechService';
import type { SpeechModel, SpeechMode } from '@shared/types';
import { SPEECH_MODES } from '@shared/constants';

// API models
import Gpt4oMiniTranscribeService from './models/api/Gpt4oMiniTranscribeService';
import Gpt4oTranscribeService from './models/api/Gpt4oTranscribeService';
import Whisper1TranscribeService from './models/api/Whisper1TranscribeService';

// Local models
import TinyTranscribeService from './models/local/TinyTranscribeService';
import BaseTranscribeService from './models/local/BaseTranscribeService';
import SmallTranscribeService from './models/local/SmallTranscribeService';
import MediumTranscribeService from './models/local/MediumTranscribeService';
import LargeTranscribeService from './models/local/LargeTranscribeService';
import LargeV2TranscribeService from './models/local/LargeV2TranscribeService';
import LargeV3TranscribeService from './models/local/LargeV3TranscribeService';

export const createSpeechService = (mode: SpeechMode, model: SpeechModel, accessToken?: string): BaseSpeechService => {
  if (mode === SPEECH_MODES.API) {
    switch (model) {
      case 'gpt-4o-mini-transcribe':
        return new Gpt4oMiniTranscribeService(accessToken);
      case 'gpt-4o-transcribe':
        return new Gpt4oTranscribeService(accessToken);
      case 'whisper-1':
        return new Whisper1TranscribeService(accessToken);
      default:
        throw new Error(`Неизвестная модель API транскрибации: ${model}`);
    }
  }

  switch (model.toLowerCase()) {
    case 'tiny':
      return new TinyTranscribeService();
    case 'base':
      return new BaseTranscribeService();
    case 'small':
      return new SmallTranscribeService();
    case 'medium':
      return new MediumTranscribeService();
    case 'large':
      return new LargeTranscribeService();
    case 'large-v2':
      return new LargeV2TranscribeService();
    case 'large-v3':
      return new LargeV3TranscribeService();
    default:
      throw new Error(`Неизвестная локальная модель транскрибации: ${model}`);
  }
};

export default createSpeechService;
