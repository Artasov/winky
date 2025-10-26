import type { Schema } from 'electron-store';
import { LLM_API_MODELS, LLM_LOCAL_MODELS, LLM_MODES, SPEECH_API_MODELS, SPEECH_LOCAL_MODELS, SPEECH_MODES } from '@shared/constants';
import type { ActionConfig, AppConfig, AuthTokens, LLMMode, SpeechMode } from '@shared/types';

const DEFAULT_CONFIG: AppConfig = {
  auth: {
    accessToken: '',
    refreshToken: ''
  },
  setupCompleted: false,
  speech: {
    mode: SPEECH_MODES.API,
    model: SPEECH_API_MODELS[0]
  },
  llm: {
    mode: LLM_MODES.API,
    model: LLM_API_MODELS[0]
  },
  apiKeys: {
    openai: '',
    google: ''
  },
  actions: []
};

const schema: Schema<AppConfig> = {
  auth: {
    type: 'object',
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' }
    },
    required: ['accessToken', 'refreshToken']
  },
  setupCompleted: { type: 'boolean' },
  speech: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: Object.values(SPEECH_MODES) },
      model: { type: 'string' }
    },
    required: ['mode']
  },
  llm: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: Object.values(LLM_MODES) },
      model: { type: 'string' }
    },
    required: ['mode']
  },
  apiKeys: {
    type: 'object',
    properties: {
      openai: { type: 'string' },
      google: { type: 'string' }
    },
    required: ['openai', 'google']
  },
  actions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        icon: { type: 'string' },
        name: { type: 'string' },
        prompt: { type: 'string' }
      },
      required: ['id', 'icon', 'name', 'prompt']
    }
  }
};

interface ElectronStoreInstance {
  store: AppConfig;
  set(key: string, value: unknown): void;
  set(object: Partial<AppConfig>): void;
  get<Key extends keyof AppConfig>(key: Key): AppConfig[Key];
  get<T = unknown>(key: string): T;
  path: string;
}

type ElectronStoreModule = typeof import('electron-store');

let storePromise: Promise<ElectronStoreInstance> | null = null;

const cloneDefaultConfig = (): AppConfig => JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;

const loadElectronStoreModule = async (): Promise<ElectronStoreModule> => {
  return new Function('return import("electron-store")')() as Promise<ElectronStoreModule>;
};

const createStore = async (): Promise<ElectronStoreInstance> => {
  const { default: StoreConstructor } = await loadElectronStoreModule();
  const instance = new StoreConstructor<AppConfig>({
    name: 'config',
    fileExtension: 'json',
    defaults: DEFAULT_CONFIG,
    schema,
    clearInvalidConfig: false
  });
  return instance as unknown as ElectronStoreInstance;
};

const getStore = async (): Promise<ElectronStoreInstance> => {
  if (!storePromise) {
    storePromise = createStore();
  }
  return storePromise;
};

const ensureConfigIntegrity = async (): Promise<AppConfig> => {
  const store = await getStore();
  const current = store.store;
  let changed = false;

  if (!current.speech) {
    current.speech = { mode: SPEECH_MODES.API, model: SPEECH_API_MODELS[0] };
    changed = true;
  } else {
    if (!current.speech.mode) {
      current.speech.mode = SPEECH_MODES.API;
      changed = true;
    }
    if (!current.speech.model) {
      current.speech.model = current.speech.mode === SPEECH_MODES.API ? SPEECH_API_MODELS[0] : SPEECH_LOCAL_MODELS[0];
      changed = true;
    }
  }

  if (!current.llm) {
    current.llm = { mode: LLM_MODES.API, model: LLM_API_MODELS[0] };
    changed = true;
  } else {
    if (!current.llm.mode) {
      current.llm.mode = LLM_MODES.API;
      changed = true;
    }
    if (!current.llm.model) {
      current.llm.model = current.llm.mode === LLM_MODES.API ? LLM_API_MODELS[0] : LLM_LOCAL_MODELS[0];
      changed = true;
    }
  }

  if (changed) {
    store.store = current;
  }

  return current;
};

export const getConfig = async (): Promise<AppConfig> => {
  return ensureConfigIntegrity();
};

export const setConfig = async (config: AppConfig): Promise<AppConfig> => {
  const store = await getStore();
  store.store = config;
  await ensureConfigIntegrity();
  return store.store;
};

export const updateConfig = async (partialConfig: Partial<AppConfig>): Promise<AppConfig> => {
  const store = await getStore();
  store.set(partialConfig as Record<string, unknown>);
  await ensureConfigIntegrity();
  return store.store;
};

export const getAuthTokens = async (): Promise<AuthTokens> => {
  const store = await getStore();
  return store.get('auth');
};

export const setAuthTokens = async (auth: AuthTokens): Promise<AppConfig> => {
  const store = await getStore();
  store.set('auth', auth);
  return store.store;
};

export const setSpeechMode = async (mode: SpeechMode): Promise<AppConfig> => {
  const store = await getStore();
  store.set('speech.mode', mode);
  return store.store;
};

export const setLLMMode = async (mode: LLMMode): Promise<AppConfig> => {
  const store = await getStore();
  store.set('llm.mode', mode);
  return store.store;
};

export const setActions = async (actions: ActionConfig[]): Promise<ActionConfig[]> => {
  const store = await getStore();
  store.set('actions', actions);
  return store.get('actions');
};

export const getConfigFilePath = async (): Promise<string> => {
  const store = await getStore();
  return store.path;
};

export const resetConfig = async (): Promise<AppConfig> => {
  const store = await getStore();
  store.store = cloneDefaultConfig();
  return store.store;
};
