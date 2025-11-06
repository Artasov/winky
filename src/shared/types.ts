import { LLM_API_MODELS, LLM_LOCAL_MODELS, LLM_MODES, SPEECH_API_MODELS, SPEECH_LOCAL_MODELS, SPEECH_MODES } from './constants';

export type SpeechMode = (typeof SPEECH_MODES)[keyof typeof SPEECH_MODES];
export type LLMMode = (typeof LLM_MODES)[keyof typeof LLM_MODES];
export type LLMModel = (typeof LLM_API_MODELS)[number] | (typeof LLM_LOCAL_MODELS)[number];
export type SpeechModel = (typeof SPEECH_API_MODELS)[number] | (typeof SPEECH_LOCAL_MODELS)[number];

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: number;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  date_joined?: string;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user?: User;
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
  show_results?: boolean;
  sound_on_complete?: boolean;
  auto_copy_result?: boolean;
}

export interface ActionPreferences {
  show_results: boolean;
  sound_on_complete: boolean;
  auto_copy_result: boolean;
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
    model: SpeechModel;
  };
  llm: {
    mode: LLMMode;
    model: LLMModel;
  };
  apiKeys: ApiKeys;
  actions: ActionConfig[];
  micWindowPosition?: {
    x: number;
    y: number;
  };
  micHotkey?: string;
  micAnchor?: MicAnchor;
  micAutoStartRecording?: boolean;
}

export interface LLMProcessResponse {
  result: string;
}

export interface TranscriptionResponse {
  text: string;
}

export type MicAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
