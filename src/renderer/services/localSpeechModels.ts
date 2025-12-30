import axios, {AxiosInstance} from 'axios';
import {
    FAST_WHISPER_BASE_URL,
    SPEECH_LOCAL_MODEL_ALIASES,
    SPEECH_LOCAL_MODEL_DETAILS
} from '@shared/constants';

const localSpeechClient: AxiosInstance = axios.create({
    baseURL: FAST_WHISPER_BASE_URL,
    timeout: 10000
});

localSpeechClient.interceptors.request.use(
    (config) => {
        const method = config.method?.toUpperCase() || 'GET';
        const url = config.url || '';
        const fullUrl = url.startsWith('http') ? url : `${config.baseURL}${url}`;
        console.log(`%cLocalSpeech → %c[${method}] %c${fullUrl}`,
            'color: #10b981; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6'
        );
        if (config.params) {
            console.log('  📤 Request params:', config.params);
        }
        if (config.data) {
            console.log('  📤 Request data:', config.data);
        }
        return config;
    },
    (error) => {
        console.error('%cLocalSpeech → ERROR', 'color: #ef4444; font-weight: bold', error);
        return Promise.reject(error);
    }
);

localSpeechClient.interceptors.response.use(
    (response) => {
        const method = response.config.method?.toUpperCase() || 'GET';
        const url = response.config.url || '';
        const fullUrl = url.startsWith('http') ? url : `${response.config.baseURL}${url}`;
        const status = response.status;
        console.log(`%cLocalSpeech ← %c[${method}] %c${fullUrl} %c[${status}]`,
            'color: #10b981; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6',
            'color: #22c55e; font-weight: bold'
        );
        console.log('  📥 Response data:', response.data);
        return response;
    },
    (error) => {
        const method = error.config?.method?.toUpperCase() || 'GET';
        const url = error.config?.url || 'unknown';
        const fullUrl = url.startsWith('http') ? url : `${error.config?.baseURL}${url}`;
        const status = error.response?.status || 'N/A';
        console.error(`%cLocalSpeech ← %c[${method}] %c${fullUrl} %c[${status}]`,
            'color: #ef4444; font-weight: bold',
            'color: #3b82f6; font-weight: bold',
            'color: #8b5cf6',
            'color: #ef4444; font-weight: bold'
        );
        if (error.response?.data) {
            console.error('  ❌ Error data:', error.response.data);
        } else {
            console.error('  ❌ Error:', error.message);
        }
        return Promise.reject(error);
    }
);

export type LocalModelDownloadResponse = {
    status: 'downloaded' | 'already_present';
    model: string;
    model_path: string;
    download_root: string;
    elapsed: number;
};

export type LocalModelWarmupResponse = {
    status: 'ready';
    model: string;
    device: string;
    compute_type: string;
    load_time: number;
};

const localModelCache = new Map<string, boolean>();
const warmupModelsInProgress = new Set<string>();
type WarmupListener = (activeModels: Set<string>) => void;
const warmupListeners = new Set<WarmupListener>();
const activeTranscriptions = new Set<number>();
type TranscriptionListener = (inProgress: boolean) => void;
const transcriptionListeners = new Set<TranscriptionListener>();
let transcriptionCounter = 0;

const log = (message: string, ...args: any[]) => {
    console.log(`%c[LocalModel] %c${message}`, 'color:#0ea5e9;font-weight:600', 'color:#111827', ...args);
};

const logError = (message: string, error?: unknown) => {
    console.error(`%c[LocalModel] %c${message}`, 'color:#ef4444;font-weight:600', 'color:#111827', error || '');
};

export type LocalModelExistsResponse = {
    exists: boolean;
    model: string;
    model_path?: string;
};

const localModelDetailsMap = SPEECH_LOCAL_MODEL_DETAILS as Record<string, {label: string; size: string}>;
const legacyLocalModelMap = Object.entries(SPEECH_LOCAL_MODEL_ALIASES).reduce<Record<string, string>>(
    (acc, [key, value]) => {
        acc[key.toLowerCase()] = value;
        return acc;
    },
    {}
);

export const normalizeLocalSpeechModelName = (model: string): string => {
    const trimmed = (model ?? '').trim();
    if (!trimmed) {
        return '';
    }
    const alias = legacyLocalModelMap[trimmed.toLowerCase()];
    return alias ?? trimmed;
};

export const getLocalSpeechModelMetadata = (
    model: string
): {id: string; label: string; size: string} | null => {
    const normalized = normalizeLocalSpeechModelName(model);
    if (!normalized) {
        return null;
    }
    const details = localModelDetailsMap[normalized];
    if (!details) {
        return null;
    }
    return {id: normalized, label: details.label, size: details.size};
};

const describeLocalSpeechModel = (model: string): string => {
    const metadata = getLocalSpeechModelMetadata(model);
    if (metadata) {
        return `${metadata.label} (${metadata.size})`;
    }
    return model;
};

const notifyWarmupSubscribers = () => {
    const snapshot = new Set(warmupModelsInProgress);
    warmupListeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.error('[LocalModel] Warmup listener error', error);
        }
    });
};

const setWarmupState = (model: string, inProgress: boolean) => {
    if (!model) {
        return;
    }
    if (inProgress) {
        if (warmupModelsInProgress.has(model)) {
            return;
        }
        warmupModelsInProgress.add(model);
        notifyWarmupSubscribers();
        return;
    }
    if (!warmupModelsInProgress.has(model)) {
        return;
    }
    warmupModelsInProgress.delete(model);
    notifyWarmupSubscribers();
};

const notifyTranscriptionSubscribers = () => {
    const inProgress = activeTranscriptions.size > 0;
    transcriptionListeners.forEach((listener) => {
        try {
            listener(inProgress);
        } catch (error) {
            console.error('[LocalModel] Transcription listener error', error);
        }
    });
};

const registerTranscription = (): number => {
    transcriptionCounter += 1;
    activeTranscriptions.add(transcriptionCounter);
    notifyTranscriptionSubscribers();
    return transcriptionCounter;
};

const unregisterTranscription = (token?: number) => {
    if (typeof token !== 'number') {
        return;
    }
    if (!activeTranscriptions.has(token)) {
        return;
    }
    activeTranscriptions.delete(token);
    notifyTranscriptionSubscribers();
};

const hasActiveTranscriptions = (): boolean => activeTranscriptions.size > 0;

export const subscribeToLocalTranscriptions = (listener: TranscriptionListener): (() => void) => {
    transcriptionListeners.add(listener);
    listener(hasActiveTranscriptions());
    return () => {
        transcriptionListeners.delete(listener);
    };
};

export const markLocalTranscriptionStart = (): number => registerTranscription();

export const markLocalTranscriptionFinish = (token?: number): void => {
    unregisterTranscription(token);
};

const waitForTranscriptionsToFinish = (timeoutMs: number = 15_000): Promise<boolean> => {
    if (!hasActiveTranscriptions()) {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let unsubscribe: (() => void) | null = null;
        const handleUpdate = (inProgress: boolean) => {
            if (inProgress) {
                return;
            }
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
            unsubscribe?.();
            resolve(true);
        };
        unsubscribe = subscribeToLocalTranscriptions(handleUpdate);
        if (timeoutMs > 0) {
            timeoutId = setTimeout(() => {
                unsubscribe?.();
                resolve(false);
            }, timeoutMs);
        }
    });
};

export const subscribeToLocalModelWarmup = (listener: WarmupListener): (() => void) => {
    warmupListeners.add(listener);
    listener(new Set(warmupModelsInProgress));
    return () => {
        warmupListeners.delete(listener);
    };
};

export const checkLocalModelDownloaded = async (model: string, options: {force?: boolean} = {}): Promise<boolean> => {
    const trimmed = normalizeLocalSpeechModelName(model);
    if (!trimmed) {
        console.log('[checkLocalModelDownloaded] Модель пустая, возвращаем false');
        return false;
    }
    if (!options.force && localModelCache.has(trimmed)) {
        const cached = Boolean(localModelCache.get(trimmed));
        console.log(`[checkLocalModelDownloaded] Используем кэш для модели ${trimmed}: ${cached}`);
        return cached;
    }
    console.log(`[checkLocalModelDownloaded] Запуск HTTP запроса для модели: ${trimmed}`);
    try {
        const {data} = await localSpeechClient.get<LocalModelExistsResponse>('/download/model/exists', {
            params: {model: trimmed}
        });
        const exists = Boolean(data.exists);
        localModelCache.set(trimmed, exists);
        console.log(`[checkLocalModelDownloaded] Результат для модели ${trimmed}: ${exists}`);
        return exists;
    } catch (error: any) {
        console.error(`[checkLocalModelDownloaded] Ошибка для модели ${trimmed}:`, error);
        localModelCache.set(trimmed, false);
        return false;
    }
};

export const downloadLocalSpeechModel = async (model: string): Promise<LocalModelDownloadResponse> => {
    const trimmed = normalizeLocalSpeechModelName(model);
    if (!trimmed) {
        throw new Error('Model name is missing.');
    }
    log(`Запуск скачивания модели ${describeLocalSpeechModel(trimmed)}…`);
    try {
        const {data} = await localSpeechClient.post<LocalModelDownloadResponse>(
            '/v1/models/download',
            {model: trimmed},
            {
                headers: {'Content-Type': 'application/json'},
                timeout: 30 * 60 * 1000 // 30 минут
            }
        );
        log(
            `Скачивание завершено (${data.status}) для модели ${describeLocalSpeechModel(
                trimmed
            )}. Путь: ${data.model_path}`
        );
        localModelCache.set(trimmed, true);
        return data;
    } catch (error: any) {
        logError(
            `Скачивание модели ${describeLocalSpeechModel(trimmed)} завершилось ошибкой`,
            error?.response?.data ?? error
        );
        throw error;
    }
};

// Отслеживаем активные warmup запросы для предотвращения дубликатов
const activeWarmupRequests = new Map<string, Promise<LocalModelWarmupResponse>>();

export const warmupLocalSpeechModel = async (model: string, device?: string): Promise<LocalModelWarmupResponse> => {
    const trimmed = normalizeLocalSpeechModelName(model);
    if (!trimmed) {
        throw new Error('Model name is missing.');
    }
    
    // Проверяем, есть ли уже активный запрос для этой модели
    const existingRequest = activeWarmupRequests.get(trimmed);
    if (existingRequest) {
        log(`Прогрев модели ${describeLocalSpeechModel(trimmed)} уже выполняется, ожидаем…`);
        return existingRequest;
    }
    
    if (hasActiveTranscriptions()) {
        const idle = await waitForTranscriptionsToFinish();
        if (!idle) {
            log(`Пропускаем прогрев модели ${describeLocalSpeechModel(trimmed)}: идёт транскрибация.`);
            return {
                status: 'ready',
                model: trimmed,
                device: 'busy',
                compute_type: 'skipped',
                load_time: 0
            };
        }
    }
    
    const payload: Record<string, string> = {model: trimmed};
    if (device) {
        payload.device = device;
    }
    log(`Прогрев модели ${describeLocalSpeechModel(trimmed)} (device=${device ?? 'auto'})…`);
    setWarmupState(trimmed, true);
    
    const warmupPromise = (async (): Promise<LocalModelWarmupResponse> => {
        try {
            const {data} = await localSpeechClient.post<LocalModelWarmupResponse>(
                '/v1/models/warmup',
                payload,
                {
                    headers: {'Content-Type': 'application/json'},
                    timeout: 2 * 60 * 1000
                }
            );
            log(
                `Модель ${describeLocalSpeechModel(trimmed)} прогрета: device=${data.device}, compute=${
                    data.compute_type
                }, t=${data.load_time.toFixed(2)}s`
            );
            return data;
        } catch (error: any) {
            const status = error?.response?.status;
            // 409 Conflict означает, что модель занята (транскрипция или другой warmup)
            // Это не ошибка - просто модель уже используется
            if (status === 409) {
                log(`Модель ${describeLocalSpeechModel(trimmed)} занята (409 Conflict), пропускаем прогрев.`);
                return {
                    status: 'ready',
                    model: trimmed,
                    device: 'busy',
                    compute_type: 'skipped',
                    load_time: 0
                };
            }
            logError(
                `Прогрев модели ${describeLocalSpeechModel(trimmed)} завершился ошибкой`,
                error?.response?.data ?? error
            );
            throw error;
        } finally {
            setWarmupState(trimmed, false);
            activeWarmupRequests.delete(trimmed);
        }
    })();
    
    activeWarmupRequests.set(trimmed, warmupPromise);
    return warmupPromise;
};
