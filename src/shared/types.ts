import { LLM_MODES, SPEECH_MODES } from './constants';

export type SpeechMode = (typeof SPEECH_MODES)[keyof typeof SPEECH_MODES];
export type LLMMode = (typeof LLM_MODES)[keyof typeof LLM_MODES];

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user?: Record<string, unknown>;
}

export interface ActionConfig {
  id: string;
  icon: string;
  name: string;
  prompt: string;
}

export interface ApiKeys {
  openai: string;
  google: string;
}

export interface AppConfig {
  auth: AuthTokens;
  setupCompleted: boolean;
  speech: {
    mode: SpeechMode;
  };
  llm: {
    mode: LLMMode;
  };
  apiKeys: ApiKeys;
  actions: ActionConfig[];
}

export interface LLMProcessResponse {
  result: string;
}

export interface TranscriptionResponse {
  text: string;
}
