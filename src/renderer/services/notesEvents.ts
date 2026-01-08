import {emit, listen} from '@tauri-apps/api/event';
import type {WinkyNote} from '@shared/types';
import type {NotesStorageMode} from './notesService';

export type NotesEvent =
    | { type: 'added'; mode?: NotesStorageMode; entry: WinkyNote }
    | { type: 'updated'; mode?: NotesStorageMode; entry: WinkyNote }
    | { type: 'deleted'; mode?: NotesStorageMode; id: string }
    | { type: 'bulk-deleted'; mode?: NotesStorageMode; ids: string[] };

type NotesEventListener = (event: NotesEvent) => void;

export const emitNotesEvent = (event: NotesEvent): void => {
    emit('notes:updated', event).catch((error) => {
        console.warn('[notesEvents] Failed to emit notes event', error);
    });
};

export const subscribeNotesEvent = (listener: NotesEventListener): (() => void) => {
    let stopped = false;
    const unlistenPromise = listen<NotesEvent>('notes:updated', (event) => {
        if (stopped) {
            return;
        }
        listener(event.payload);
    }).catch((error) => {
        console.warn('[notesEvents] Failed to subscribe to notes events', error);
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
};
