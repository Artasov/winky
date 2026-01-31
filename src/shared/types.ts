import {
    LLM_GEMINI_API_MODELS,
    LLM_LOCAL_MODELS,
    LLM_MODES,
    LLM_OPENAI_API_MODELS,
    LLM_WINKY_API_MODELS,
    SPEECH_API_MODELS,
    SPEECH_LOCAL_MODELS,
    SPEECH_MODES,
    SPEECH_WINKY_API_MODELS
} from './constants';

export type TranscribeMode = (typeof SPEECH_MODES)[keyof typeof SPEECH_MODES];
export type LLMMode = (typeof LLM_MODES)[keyof typeof LLM_MODES];
export type LLMModel =
    | (typeof LLM_WINKY_API_MODELS)[number]
    | (typeof LLM_OPENAI_API_MODELS)[number]
    | (typeof LLM_GEMINI_API_MODELS)[number]
    | (typeof LLM_LOCAL_MODELS)[number];
export type TranscribeModel =
    | (typeof SPEECH_WINKY_API_MODELS)[number]
    | (typeof SPEECH_API_MODELS)[number]
    | (typeof SPEECH_LOCAL_MODELS)[number];

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
    // AI кредиты для оплаты LLM запросов
    balance_credits?: number | null;
    // Дополнительные поля с расширенной информацией о тарифе/балансе
    features?: string[];
    available_features?: string[];
    perks?: string[];
    winky_balance?: number | string | null;
    token_balance?: number | string | null;
    balance?: number | string | null;
    winky_tier?: string | null;
    tier?: string | null;
    active_tier?: string | null;
    tiers_and_features?: Array<Record<string, any>>;
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
    prompt_recognizing?: string | null;
    hotkey?: string;
    icon: string;
    icon_details: ActionIcon;
    created_at: string;
    updated_at: string;
    priority?: number;
    show_results?: boolean;
    sound_on_complete?: boolean;
    auto_copy_result?: boolean;
    is_active?: boolean;
    is_default?: boolean;
    llm_model?: string | null;
}

export interface ActionGroup {
    id: string;
    profile: string;
    name: string;
    description: string;
    color: string;
    priority: number;
    icon: string;
    icon_details: ActionIcon;
    actions: ActionConfig[];
    created_at: string;
    updated_at: string;
    is_system?: boolean;
}

export interface ActionHistoryEntry {
    id: string;
    created_at: string;
    action_id: string;
    action_name: string;
    action_prompt?: string | null;
    transcription: string;
    llm_response?: string | null;
    result_text: string;
    audio_path?: string | null;
}

export interface WinkyNote {
    id: string;
    profile: string;
    title: string;
    description: string;
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
        mode: TranscribeMode;
        model: TranscribeModel;
    };
    llm: {
        mode: LLMMode;
        model: LLMModel;
    };
    apiKeys: ApiKeys;
    groups: ActionGroup[];
    actions: ActionConfig[];
    selectedGroupId?: string | null;
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
    completionSoundEnabled?: boolean;
    showAvatarVideo?: boolean;
    notesStorageMode?: 'api' | 'local';
    saveAudioHistory?: boolean;
    trimSilenceOnActions?: boolean;
    globalTranscribePrompt?: string;
    globalLlmPrompt?: string;
    selectedMicrophoneId?: string;
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
    installDir?: string;
    updatedAt: number;
}

export interface WinkyChat {
    id: string;
    title: string;
    additional_context: string;
    message_count: number;
    last_leaf_message_id: string | null;
    pinned_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface WinkyChatMessage {
    id: string;
    parent_id: string | null;
    role: 'user' | 'assistant';
    content: string;
    model_level: 'low' | 'mid' | 'high' | 'transcribe';
    tokens: number;
    has_children: boolean;
    sibling_count: number;
    sibling_index: number;
    created_at: string;
}

export interface WinkyChatsPaginated {
    items: WinkyChat[];
    total: number;
    page: number;
    page_size: number;
    pages: number;
}

export interface WinkyChatMessagesPaginated {
    items: WinkyChatMessage[];
    total: number;
    page: number;
    page_size: number;
    pages: number;
}

export interface WinkyChatBranchResponse {
    chat_id: string;
    leaf_message_id: string | null;
    items: WinkyChatMessage[];
    has_more: boolean;
    next_cursor: string | null;
}

export interface MessageChildrenResponse {
    chat_id: string;
    parent_id: string;
    items: WinkyChatMessage[];
    total: number;
}
