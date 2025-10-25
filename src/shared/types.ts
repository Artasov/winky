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

export interface ActionIcon {
  id: string;
  name: string;
  svg: string;
  created_at: string;
  updated_at: string;
}

export interface ActionConfig {
  id: string;
  profile: string;
  name: string;
  prompt: string;
  icon: string;
  icon_details: ActionIcon;
  created_at: string;
  updated_at: string;
}

export interface WinkyProfile {
  id: string;
  user: number;
  created_at: string;
  updated_at: string;
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
