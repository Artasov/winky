import axios, {type AxiosInstance} from 'axios';
import {
    FAST_WHISPER_BASE_URL,
    SPEECH_LOCAL_MODEL_ALIASES,
    SPEECH_LOCAL_MODEL_DETAILS
} from '@shared/constants';
import type {FastWhisperStatus} from '@shared/types';
import {
    localSpeechBridge,
    type LocalSpeechModelStatus,
    type LocalSpeechModelStatusEvent
} from '../winkyBridge/localSpeechBridge';

export type {LocalSpeechModelPhase, LocalSpeechModelStatus} from '../winkyBridge/localSpeechBridge';

export type LocalSpeechServerAction = 'install' | 'start' | 'restart' | 'reinstall' | 'stop';

export interface LocalSpeechState {
    serverStatus: FastWhisperStatus | null;
    serverLoading: boolean;
    serverError: string | null;
    serverOperation: LocalSpeechServerAction | null;
    models: Readonly<Record<string, LocalSpeechModelStatus>>;
    activeTranscriptions: readonly number[];
}

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

type LocalModelExistsResponse = {
    exists: boolean;
    model: string;
    model_path?: string;
};

type LocalSpeechStateListener = () => void;
type LocalSpeechApiError = {
    detail?: string;
    message?: string;
};

const localModelDetailsMap = SPEECH_LOCAL_MODEL_DETAILS as Record<string, {label: string; size: string}>;
const legacyLocalModelMap = Object.entries(SPEECH_LOCAL_MODEL_ALIASES).reduce<Record<string, string>>(
    (result, [key, value]) => {
        result[key.toLowerCase()] = value;
        return result;
    },
    {}
);

export const normalizeLocalSpeechModelName = (model: string): string => {
    const trimmed = (model ?? '').trim();
    if (!trimmed) return '';
    return legacyLocalModelMap[trimmed.toLowerCase()] ?? trimmed;
};

export const getLocalSpeechModelMetadata = (
    model: string
): {id: string; label: string; size: string} | null => {
    const normalized = normalizeLocalSpeechModelName(model);
    const details = normalized ? localModelDetailsMap[normalized] : undefined;
    return details ? {id: normalized, label: details.label, size: details.size} : null;
};

class LocalSpeechManager {
    private readonly client: AxiosInstance = axios.create({
        baseURL: FAST_WHISPER_BASE_URL,
        timeout: 10_000
    });
    private readonly listeners = new Set<LocalSpeechStateListener>();
    private readonly downloadRequests = new Map<string, Promise<LocalModelDownloadResponse>>();
    private readonly warmupRequests = new Map<string, Promise<LocalModelWarmupResponse>>();
    private readonly modelEventRevisions = new Map<string, number>();
    private readonly sourceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `renderer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    private state: LocalSpeechState = {
        serverStatus: null,
        serverLoading: false,
        serverError: null,
        serverOperation: null,
        models: {},
        activeTranscriptions: []
    };
    private bridgeStarted = false;
    private modelRevision = 0;
    private transcriptionToken = 0;
    private refreshRequest: Promise<FastWhisperStatus | null> | null = null;
    private serverRequest: Promise<FastWhisperStatus> | null = null;

    getSnapshot = (): LocalSpeechState => this.state;

    subscribe = (listener: LocalSpeechStateListener): (() => void) => {
        this.startBridge();
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    setServerStatus = (status: FastWhisperStatus | null): void => {
        if (!status) {
            this.setState({serverStatus: null});
            return;
        }

        const normalizedStatus = status.phase === 'error' ? status : {...status, error: undefined};
        const models = this.getModelsForServerStatus(normalizedStatus);
        this.state = {
            ...this.state,
            serverStatus: normalizedStatus,
            serverLoading: false,
            serverError: normalizedStatus.phase === 'error'
                ? normalizedStatus.error || normalizedStatus.message || 'Local server error.'
                : null,
            models
        };
        this.notify();
    };

    refreshServerStatus = (checkHealth: boolean = false): Promise<FastWhisperStatus | null> => {
        this.startBridge();
        if (this.refreshRequest) return this.refreshRequest;

        this.setState({serverLoading: true});
        const request = (async (): Promise<FastWhisperStatus | null> => {
            try {
                const status = checkHealth
                    ? await localSpeechBridge.checkHealth()
                    : await localSpeechBridge.getStatus();
                this.setServerStatus(status);
                return status;
            } catch (error) {
                const message = this.getErrorMessage(error, 'Failed to request local server status.');
                this.setState({serverLoading: false, serverError: message});
                console.error(`[LocalSpeech] Status request failed: ${message}`);
                return null;
            } finally {
                this.refreshRequest = null;
            }
        })();
        this.refreshRequest = request;
        return request;
    };

    install = (targetDir: string): Promise<FastWhisperStatus> =>
        this.runServerOperation('install', () => localSpeechBridge.install(targetDir));

    start = (): Promise<FastWhisperStatus> =>
        this.runServerOperation('start', () => localSpeechBridge.start());

    restart = (): Promise<FastWhisperStatus> =>
        this.runServerOperation('restart', () => localSpeechBridge.restart());

    reinstall = (targetDir: string): Promise<FastWhisperStatus> =>
        this.runServerOperation('reinstall', () => localSpeechBridge.reinstall(targetDir));

    stop = (): Promise<FastWhisperStatus> =>
        this.runServerOperation('stop', () => localSpeechBridge.stop());

    checkModelDownloaded = async (
        model: string,
        options: {force?: boolean} = {}
    ): Promise<boolean> => {
        this.startBridge();
        const normalized = normalizeLocalSpeechModelName(model);
        if (!normalized) return false;

        const downloadRequest = this.downloadRequests.get(normalized);
        if (downloadRequest) {
            try {
                await downloadRequest;
                return true;
            } catch {
                return false;
            }
        }

        const current = this.getModelStatus(normalized);
        if (!options.force && current.downloaded !== null && current.phase !== 'error') {
            return current.downloaded;
        }

        this.updateModel(normalized, {phase: 'checking', error: undefined});
        try {
            const downloaded = this.state.serverStatus?.running
                ? Boolean((await this.client.get<LocalModelExistsResponse>(
                    '/download/model/exists',
                    {params: {model: normalized}}
                )).data.exists)
                : await localSpeechBridge.isModelDownloaded(normalized);
            this.updateModel(normalized, {
                downloaded,
                phase: downloaded ? 'installed' : 'missing',
                error: undefined
            });
            return downloaded;
        } catch (error) {
            const message = this.getErrorMessage(error, 'Failed to verify the local speech model.');
            this.updateModel(normalized, {
                downloaded: current.downloaded,
                phase: 'error',
                error: message
            });
            console.error(`[LocalSpeech] Model check failed for ${normalized}: ${message}`);
            return false;
        }
    };

    downloadModel = (model: string): Promise<LocalModelDownloadResponse> => {
        this.startBridge();
        const normalized = this.getModelName(model);
        const existingRequest = this.downloadRequests.get(normalized);
        if (existingRequest) return existingRequest;

        const request = this.runModelDownload(normalized);
        this.downloadRequests.set(normalized, request);
        void request.finally(() => {
            if (this.downloadRequests.get(normalized) === request) this.downloadRequests.delete(normalized);
        }).catch(() => undefined);
        return request;
    };

    warmupModel = (model: string, device?: string): Promise<LocalModelWarmupResponse> => {
        this.startBridge();
        const normalized = this.getModelName(model);
        const existingRequest = this.warmupRequests.get(normalized);
        if (existingRequest) return existingRequest;

        const request = this.runModelWarmup(normalized, device);
        this.warmupRequests.set(normalized, request);
        void request.finally(() => {
            if (this.warmupRequests.get(normalized) === request) this.warmupRequests.delete(normalized);
        }).catch(() => undefined);
        return request;
    };

    startTranscription = (): number => {
        this.transcriptionToken += 1;
        this.setState({
            activeTranscriptions: [...this.state.activeTranscriptions, this.transcriptionToken]
        });
        return this.transcriptionToken;
    };

    finishTranscription = (token?: number): void => {
        if (typeof token !== 'number' || !this.state.activeTranscriptions.includes(token)) return;
        this.setState({
            activeTranscriptions: this.state.activeTranscriptions.filter((current) => current !== token)
        });
    };

    getModelStatus = (model: string): LocalSpeechModelStatus => {
        const normalized = normalizeLocalSpeechModelName(model);
        return this.state.models[normalized] ?? {
            model: normalized,
            phase: this.state.serverStatus?.installed === false ? 'unavailable' : 'unknown',
            downloaded: null,
            updatedAt: 0
        };
    };

    private startBridge(): void {
        if (this.bridgeStarted || typeof window === 'undefined') return;
        this.bridgeStarted = true;
        localSpeechBridge.onStatus((status) => this.setServerStatus(status));
        localSpeechBridge.onModelStatus((event) => this.applyModelEvent(event));
    }

    private setState(partial: Partial<LocalSpeechState>): void {
        this.state = {...this.state, ...partial};
        this.notify();
    }

    private notify(): void {
        this.listeners.forEach((listener) => {
            try {
                listener();
            } catch (error) {
                const message = this.getErrorMessage(error, 'Unknown listener error.');
                console.error(`[LocalSpeech] State listener failed: ${message}`);
            }
        });
    }

    private getModelsForServerStatus(status: FastWhisperStatus): Readonly<Record<string, LocalSpeechModelStatus>> {
        let changed = false;
        const models: Record<string, LocalSpeechModelStatus> = {...this.state.models};

        Object.entries(models).forEach(([model, current]) => {
            let phase = current.phase;
            let downloaded = current.downloaded;
            let error = current.error;

            if (!status.installed && status.phase !== 'installing') {
                phase = 'unavailable';
                downloaded = null;
                error = undefined;
            } else if (!status.running && !['checking', 'downloading'].includes(current.phase)) {
                phase = downloaded === true ? 'installed' : downloaded === false ? 'missing' : 'unknown';
                error = undefined;
            } else if (status.running && current.phase === 'unavailable') {
                phase = downloaded === true ? 'installed' : downloaded === false ? 'missing' : 'unknown';
                error = undefined;
            }

            if (phase === current.phase && downloaded === current.downloaded && error === current.error) return;
            changed = true;
            models[model] = {
                ...current,
                phase,
                downloaded,
                error,
                updatedAt: Math.max(Date.now(), current.updatedAt + 1)
            };
        });

        return changed ? models : this.state.models;
    }

    private runServerOperation(
        action: LocalSpeechServerAction,
        operation: () => Promise<FastWhisperStatus>
    ): Promise<FastWhisperStatus> {
        this.startBridge();
        if (this.serverRequest) return this.serverRequest;

        if (action === 'reinstall') {
            const models = Object.fromEntries(
                Object.keys(this.state.models).map((model) => [model, {
                    model,
                    phase: 'unavailable',
                    downloaded: null,
                    updatedAt: Date.now()
                } satisfies LocalSpeechModelStatus])
            );
            this.setState({models});
        }

        this.setState({serverOperation: action, serverLoading: false, serverError: null});
        const request = (async (): Promise<FastWhisperStatus> => {
            try {
                const status = await operation();
                this.setServerStatus(status);
                return status;
            } catch (error) {
                const message = this.getErrorMessage(error, `Failed to ${action} the local speech server.`);
                this.setState({serverError: message});
                console.error(`[LocalSpeech] Server operation ${action} failed: ${message}`);
                throw error;
            } finally {
                this.serverRequest = null;
                if (this.state.serverOperation === action) this.setState({serverOperation: null});
            }
        })();
        this.serverRequest = request;
        return request;
    }

    private async runModelDownload(model: string): Promise<LocalModelDownloadResponse> {
        const running = await this.getServerRunning();
        if (!running) {
            const message = 'Start the local speech server before downloading a model.';
            this.updateModel(model, {phase: 'unavailable', error: message});
            throw new Error(message);
        }

        this.updateModel(model, {phase: 'downloading', downloaded: false, error: undefined});
        console.info(`[LocalSpeech] Downloading model ${model}.`);
        try {
            const {data} = await this.client.post<LocalModelDownloadResponse>(
                '/v1/models/download',
                {model},
                {
                    headers: {'Content-Type': 'application/json'},
                    timeout: 30 * 60 * 1000
                }
            );
            this.updateModel(model, {phase: 'installed', downloaded: true, error: undefined});
            console.info(`[LocalSpeech] Model ${model} downloaded.`);
            return data;
        } catch (error) {
            const message = this.getErrorMessage(error, 'Failed to download the local speech model.');
            this.updateModel(model, {phase: 'error', downloaded: false, error: message});
            console.error(`[LocalSpeech] Model download failed for ${model}: ${message}`);
            throw error;
        }
    }

    private async runModelWarmup(model: string, device?: string): Promise<LocalModelWarmupResponse> {
        const downloadRequest = this.downloadRequests.get(model);
        if (downloadRequest) await downloadRequest;

        const running = await this.getServerRunning();
        if (!running) {
            const message = 'Start the local speech server before warming up a model.';
            this.updateModel(model, {phase: 'unavailable', error: message});
            throw new Error(message);
        }

        const current = this.getModelStatus(model);
        const downloaded = current.downloaded === true || await this.checkModelDownloaded(model, {force: true});
        if (!downloaded) {
            const message = 'Download the local speech model before warming it up.';
            this.updateModel(model, {phase: 'missing', downloaded: false, error: message});
            throw new Error(message);
        }

        if (this.state.activeTranscriptions.length > 0) {
            const idle = await this.waitForTranscriptions(15_000);
            if (!idle) {
                this.updateModel(model, {phase: 'installed', downloaded: true, error: undefined});
                return this.getBusyWarmupResponse(model);
            }
        }

        const payload: Record<string, string> = {model};
        if (device) payload.device = device;
        this.updateModel(model, {phase: 'warming', downloaded: true, error: undefined});
        console.info(`[LocalSpeech] Warming model ${model}.`);

        try {
            const {data} = await this.client.post<LocalModelWarmupResponse>(
                '/v1/models/warmup',
                payload,
                {
                    headers: {'Content-Type': 'application/json'},
                    timeout: 2 * 60 * 1000
                }
            );
            this.updateModel(model, {phase: 'ready', downloaded: true, error: undefined});
            console.info(`[LocalSpeech] Model ${model} is ready.`);
            return data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 409) {
                this.updateModel(model, {phase: 'ready', downloaded: true, error: undefined});
                return this.getBusyWarmupResponse(model);
            }
            const message = this.getErrorMessage(error, 'Failed to warm up the local speech model.');
            this.updateModel(model, {phase: 'error', downloaded: true, error: message});
            console.error(`[LocalSpeech] Model warmup failed for ${model}: ${message}`);
            throw error;
        }
    }

    private async getServerRunning(): Promise<boolean> {
        if (this.state.serverStatus?.running) return true;
        const status = await this.refreshServerStatus(true);
        return Boolean(status?.running);
    }

    private waitForTranscriptions(timeoutMs: number): Promise<boolean> {
        if (this.state.activeTranscriptions.length === 0) return Promise.resolve(true);

        return new Promise((resolve) => {
            let settled = false;
            let timer = 0;
            let unsubscribe: () => void = () => undefined;
            const finish = (idle: boolean) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                unsubscribe();
                resolve(idle);
            };
            unsubscribe = this.subscribe(() => {
                if (this.state.activeTranscriptions.length === 0) finish(true);
            });
            timer = window.setTimeout(() => finish(false), timeoutMs);
        });
    }

    private updateModel(
        model: string,
        partial: Partial<Omit<LocalSpeechModelStatus, 'model' | 'updatedAt'>>
    ): void {
        const current = this.getModelStatus(model);
        const status: LocalSpeechModelStatus = {
            ...current,
            ...partial,
            model,
            updatedAt: Math.max(Date.now(), current.updatedAt + 1)
        };
        this.state = {
            ...this.state,
            models: {...this.state.models, [model]: status}
        };
        this.notify();

        this.modelRevision += 1;
        const revisionKey = `${this.sourceId}:${model}`;
        this.modelEventRevisions.set(revisionKey, this.modelRevision);
        void localSpeechBridge.publishModelStatus({
            sourceId: this.sourceId,
            revision: this.modelRevision,
            status
        }).catch((error) => {
            const message = this.getErrorMessage(error, 'Unknown event error.');
            console.error(`[LocalSpeech] Failed to publish model status: ${message}`);
        });
    }

    private applyModelEvent(event: LocalSpeechModelStatusEvent): void {
        const model = normalizeLocalSpeechModelName(event.status.model);
        if (!model) return;
        const revisionKey = `${event.sourceId}:${model}`;
        const previousRevision = this.modelEventRevisions.get(revisionKey) ?? 0;
        if (event.revision <= previousRevision) return;
        this.modelEventRevisions.set(revisionKey, event.revision);

        const current = this.getModelStatus(model);
        if (event.status.updatedAt < current.updatedAt) return;
        this.state = {
            ...this.state,
            models: {
                ...this.state.models,
                [model]: {...event.status, model}
            }
        };
        this.notify();
    }

    private getModelName(model: string): string {
        const normalized = normalizeLocalSpeechModelName(model);
        if (!normalized) throw new Error('Model name is missing.');
        return normalized;
    }

    private getBusyWarmupResponse(model: string): LocalModelWarmupResponse {
        return {
            status: 'ready',
            model,
            device: 'busy',
            compute_type: 'skipped',
            load_time: 0
        };
    }

    private getErrorMessage(error: unknown, fallback: string): string {
        if (axios.isAxiosError<LocalSpeechApiError>(error)) {
            const detail = error.response?.data?.detail || error.response?.data?.message;
            if (detail) return detail;
            if (error.message) return error.message;
        }
        if (error instanceof Error && error.message) return error.message;
        if (typeof error === 'string' && error.trim()) return error;
        return fallback;
    }
}

export const localSpeechManager = new LocalSpeechManager();

export const getLocalSpeechState = (): LocalSpeechState => localSpeechManager.getSnapshot();

export const subscribeToLocalSpeechState = (listener: LocalSpeechStateListener): (() => void) =>
    localSpeechManager.subscribe(listener);

export const subscribeToLocalTranscriptions = (listener: (inProgress: boolean) => void): (() => void) => {
    const emitState = () => listener(localSpeechManager.getSnapshot().activeTranscriptions.length > 0);
    const unsubscribe = localSpeechManager.subscribe(emitState);
    emitState();
    return unsubscribe;
};

export const subscribeToLocalModelWarmup = (listener: (activeModels: Set<string>) => void): (() => void) => {
    const emitState = () => {
        const activeModels = new Set(
            Object.values(localSpeechManager.getSnapshot().models)
                .filter((status) => status.phase === 'warming')
                .map((status) => status.model)
        );
        listener(activeModels);
    };
    const unsubscribe = localSpeechManager.subscribe(emitState);
    emitState();
    return unsubscribe;
};

export const markLocalTranscriptionStart = (): number => localSpeechManager.startTranscription();

export const markLocalTranscriptionFinish = (token?: number): void => localSpeechManager.finishTranscription(token);

export const checkLocalModelDownloaded = (
    model: string,
    options: {force?: boolean} = {}
): Promise<boolean> => localSpeechManager.checkModelDownloaded(model, options);

export const downloadLocalSpeechModel = (model: string): Promise<LocalModelDownloadResponse> =>
    localSpeechManager.downloadModel(model);

export const warmupLocalSpeechModel = (model: string, device?: string): Promise<LocalModelWarmupResponse> =>
    localSpeechManager.warmupModel(model, device);
