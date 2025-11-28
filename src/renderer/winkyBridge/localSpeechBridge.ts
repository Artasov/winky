import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {FastWhisperStatus} from '@shared/types';

export const localSpeechBridge = {
    getStatus: (): Promise<FastWhisperStatus> => invoke('local_speech_get_status'),
    checkHealth: (): Promise<FastWhisperStatus> => invoke('local_speech_check_health'),
    install: (targetDir?: string): Promise<FastWhisperStatus> =>
        invoke('local_speech_install', {args: {targetDir}}),
    start: (): Promise<FastWhisperStatus> => invoke('local_speech_start'),
    restart: (): Promise<FastWhisperStatus> => invoke('local_speech_restart'),
    reinstall: (targetDir?: string): Promise<FastWhisperStatus> =>
        invoke('local_speech_reinstall', {args: {targetDir}}),
    stop: (): Promise<FastWhisperStatus> => invoke('local_speech_stop'),
    isModelDownloaded: (model: string): Promise<boolean> =>
        invoke('local_speech_check_model_downloaded', {model}),
    onStatus: (callback: (status: FastWhisperStatus) => void) => {
        const unlistenPromise = listen<FastWhisperStatus>('local-speech:status', (event) =>
            callback(event.payload)
        );
        return () => {
            unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
        };
    }
};

export type LocalSpeechBridge = typeof localSpeechBridge;
