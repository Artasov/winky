import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';

export type UpdatePhase =
    | 'idle'
    | 'checking'
    | 'available'
    | 'unsupported'
    | 'downloading'
    | 'ready'
    | 'installing'
    | 'error';

export type UpdateState = {
    updateAvailable: boolean;
    version?: string | null;
    fileName?: string | null;
    phase: UpdatePhase;
    installSupported: boolean;
    message?: string | null;
};

export type UpdateProgress = {
    version: string;
    percent: number;
    downloadedBytes: number;
    totalBytes: number;
};

export type UpdateAvailable = {
    version: string;
    currentVersion: string;
    fileName?: string | null;
    installSupported: boolean;
};

export type UpdateStarted = {
    version: string;
    fileName: string;
};

export type UpdateError = {
    message: string;
};

export class UpdateService {
    getState(): Promise<UpdateState> {
        return invoke('get_update_state');
    }

    check(): Promise<UpdateState> {
        return invoke('check_app_update');
    }

    download(): Promise<{version: string; fileName: string; ready: boolean}> {
        return invoke('download_app_update');
    }

    install(): Promise<void> {
        return invoke('install_app_update', {confirmed: true});
    }

    onState(callback: (state: UpdateState) => void): Promise<UnlistenFn> {
        return listen<UpdateState>('update-state-changed', (event) => callback(event.payload));
    }

    onAvailable(callback: (update: UpdateAvailable) => void): Promise<UnlistenFn> {
        return listen<UpdateAvailable>('update-available', (event) => callback(event.payload));
    }

    onProgress(callback: (progress: UpdateProgress) => void): Promise<UnlistenFn> {
        return listen<UpdateProgress>('update-download-progress', (event) => callback(event.payload));
    }

    onStarted(callback: (update: UpdateStarted) => void): Promise<UnlistenFn> {
        return listen<UpdateStarted>('update-started', (event) => callback(event.payload));
    }

    onError(callback: (error: UpdateError) => void): Promise<UnlistenFn> {
        return listen<UpdateError>('update-error', (event) => callback(event.payload));
    }
}

export const updateService = new UpdateService();
