import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {WinkyNote} from '@shared/types';

export type NotesPageResponse = {
    count: number;
    next_page: number | null;
    previous_page: number | null;
    results: WinkyNote[];
};

export type NotesUpdateEvent =
    | { type: 'added'; entry: WinkyNote; mode?: 'local' | 'api' }
    | { type: 'updated'; entry: WinkyNote; mode?: 'local' | 'api' }
    | { type: 'deleted'; id: string; mode?: 'local' | 'api' }
    | { type: 'bulk-deleted'; ids: string[]; mode?: 'local' | 'api' };

type NoteCreatePayload = {
    title: string;
    description?: string;
    x_username?: string;
};

type NoteUpdatePayload = {
    id: string;
    title?: string;
    description?: string;
    x_username?: string;
};

export const notesBridge = {
    get: (page = 1, pageSize = 20): Promise<NotesPageResponse> =>
        invoke('notes_get', {args: {page, pageSize}}),
    create: (payload: NoteCreatePayload): Promise<WinkyNote> =>
        invoke('notes_create', {payload}),
    update: (payload: NoteUpdatePayload): Promise<WinkyNote> =>
        invoke('notes_update', {payload}),
    delete: (id: string): Promise<void> => invoke('notes_delete', {payload: {id}}),
    bulkDelete: (ids: string[]): Promise<{deleted_count: number}> =>
        invoke('notes_bulk_delete', {payload: {ids}}),
    subscribe: (callback: (event: NotesUpdateEvent) => void): (() => void) => {
        let stopped = false;
        const unlistenPromise = listen<NotesUpdateEvent>('notes:updated', (event) => {
            if (stopped) {
                return;
            }
            callback(event.payload);
        }).catch((error) => {
            console.warn('[notesBridge] Failed to subscribe to notes updates:', error);
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
