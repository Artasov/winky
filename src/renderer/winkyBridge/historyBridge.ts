import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {ActionHistoryEntry} from '@shared/types';

export type HistoryUpdateEvent =
    | { type: 'added'; entry: ActionHistoryEntry }
    | { type: 'updated'; entry: ActionHistoryEntry }
    | { type: 'cleared' };

type HistoryAddPayload = {
    action_id: string;
    action_name: string;
    action_prompt?: string | null;
    transcription: string;
    llm_response?: string | null;
    is_streaming?: boolean;
    result_text: string;
    audio_path?: string | null;
};

type HistoryUpdatePayload = {
    id: string;
    action_name?: string;
    action_prompt?: string;
    transcription?: string;
    llm_response?: string;
    is_streaming?: boolean;
    result_text?: string;
    audio_path?: string;
};

export const historyBridge = {
    get: (): Promise<ActionHistoryEntry[]> => invoke('history_get'),
    add: (payload: HistoryAddPayload): Promise<ActionHistoryEntry> =>
        invoke('history_add', {payload}),
    update: (payload: HistoryUpdatePayload): Promise<ActionHistoryEntry> =>
        invoke('history_update', {payload}),
    saveAudio: (audioData: ArrayBuffer, mimeType?: string): Promise<string> => {
        const audio = new Uint8Array(audioData);
        return invoke('history_save_audio', {payload: {audio, mimeType}});
    },
    readAudio: (audioPath: string): Promise<Uint8Array> =>
        invoke('history_read_audio', {payload: {audioPath}}),
    clear: (): Promise<void> => invoke('history_clear'),
    subscribe: (callback: (event: HistoryUpdateEvent) => void): (() => void) => {
        let stopped = false;
        const unlistenPromise = listen<HistoryUpdateEvent>('history:updated', (event) => {
            if (stopped) {
                return;
            }
            callback(event.payload);
        }).catch((error) => {
            console.warn('[historyBridge] Failed to subscribe to history updates:', error);
            return null;
        });

        return () => {
            stopped = true;
            unlistenPromise
                .then((unlisten) => {
                    if (typeof unlisten === 'function') {
                        unlisten();
                    }
                })
                .catch(() => {
                    /* ignore */
                });
        };
    }
};
