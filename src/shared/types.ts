import {
    LLM_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_MODES,
    SPEECH_API_MODELS,
    SPEECH_LOCAL_MODELS,
    SPEECH_MODES
} from './constants';

export type SpeechMode = (typeof SPEECH_MODES)[keyof typeof SPEECH_MODES];
export type LLMMode = (typeof LLM_MODES)[keyof typeof LLM_MODES];
export type LLMModel = (typeof LLM_API_MODELS)[number] | (typeof LLM_LOCAL_MODELS)[number];
export type SpeechModel = (typeof SPEECH_API_MODELS)[number] | (typeof SPEECH_LOCAL_MODELS)[number];

export interface AuthTokens {
    access: string;
    refresh?: string | null;
    // Legacy fields для обратной совместимости
    accessToken?: string;
    refreshToken?: string;
}

export type AuthProvider = 'google' | 'github' | 'discord';

export type AuthTokensPayload = {
    access: string;
    refresh?: string | null;
};

export type AuthDeepLinkPayload =
    | {
    kind: 'success';
    provider: AuthProvider | string;
    tokens: AuthTokensPayload;
    user?: Record<string, unknown> | null;
}
    | {
    kind: 'error';
    provider: AuthProvider | string;
    error: string;
};

export interface User {
    id: number;
    email: string;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    middle_name?: string | null;
    birth_date?: string | null;
    avatar?: string | null;
    timezone?: string | Record<string, unknown> | null;
    is_email_confirmed?: boolean;
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
    hotkey?: string;
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
    micHideOnStopRecording?: boolean;
    micShowOnLaunch?: boolean;
    launchOnSystemStartup?: boolean;
    autoStartLocalSpeechServer?: boolean;
    completionSoundVolume?: number;
}

export interface LLMProcessResponse {
    result: string;
}

export interface TranscriptionResponse {
    text: string;
}

export type MicAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type FastWhisperPhase =
    | 'not-installed'
    | 'installing'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'idle'
    | 'error';

export interface FastWhisperStatus {
    installed: boolean;
    running: boolean;
    phase: FastWhisperPhase;
    message?: string;
    error?: string;
    lastAction?: 'install' | 'start' | 'restart' | 'reinstall';
    lastSuccessAt?: number;
    logLine?: string;
    updatedAt: number;
}
