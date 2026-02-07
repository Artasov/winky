import type {AppConfig, WinkyNote} from '@shared/types';
import {notesBridge} from '../winkyBridge/notesBridge';
import {emitNotesEvent} from './notesEvents';
import {
    bulkDeleteNotes as bulkDeleteNotesApi,
    createNote as createNoteApi,
    deleteNote as deleteNoteApi,
    fetchNotesPage,
    updateNote as updateNoteApi
} from './winkyApi';
import type {NotesListResponse} from './winkyApi';

export type NotesStorageMode = 'api' | 'local';

export type NotesPage = {
    count: number;
    nextPage: number | null;
    previousPage: number | null;
    results: WinkyNote[];
};

export const resolveNotesStorageMode = (config: AppConfig | null): NotesStorageMode =>
    config?.notesStorageMode === 'local' ? 'local' : 'api';

const parsePageFromUrl = (value: string | null): number | null => {
    if (!value) {
        return null;
    }
    try {
        const url = new URL(value, 'https://local');
        const raw = url.searchParams.get('page');
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        const queryIndex = value.indexOf('?');
        if (queryIndex === -1) {
            return null;
        }
        const params = new URLSearchParams(value.slice(queryIndex));
        const raw = params.get('page');
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : null;
    }
};

const mapApiResponse = (data: NotesListResponse): NotesPage => ({
    count: data.count,
    nextPage: parsePageFromUrl(data.next),
    previousPage: parsePageFromUrl(data.previous),
    results: data.results
});

const mapLocalResponse = (data: {count: number; next_page: number | null; previous_page: number | null; results: WinkyNote[]}): NotesPage => ({
    count: data.count,
    nextPage: data.next_page,
    previousPage: data.previous_page,
    results: data.results
});

export const fetchNotes = async (
    mode: NotesStorageMode,
    page: number = 1,
    pageSize: number = 20
): Promise<NotesPage> => {
    if (mode === 'local') {
        const localData = await notesBridge.get(page, pageSize);
        return mapLocalResponse(localData);
    }
    const apiData = await fetchNotesPage(page, pageSize);
    return mapApiResponse(apiData);
};

export const createNoteForMode = async (
    mode: NotesStorageMode,
    payload: {title: string; description?: string; x_username?: string}
): Promise<WinkyNote> => {
    if (mode === 'local') {
        return notesBridge.create(payload);
    }
    const entry = await createNoteApi(payload);
    emitNotesEvent({type: 'added', mode, entry});
    return entry;
};

export const updateNoteForMode = async (
    mode: NotesStorageMode,
    noteId: string,
    payload: {title?: string; description?: string; x_username?: string}
): Promise<WinkyNote> => {
    if (mode === 'local') {
        return notesBridge.update({id: noteId, ...payload});
    }
    const entry = await updateNoteApi(noteId, payload);
    emitNotesEvent({type: 'updated', mode, entry});
    return entry;
};

export const deleteNoteForMode = async (mode: NotesStorageMode, noteId: string): Promise<void> => {
    if (mode === 'local') {
        return notesBridge.delete(noteId);
    }
    await deleteNoteApi(noteId);
    emitNotesEvent({type: 'deleted', mode, id: noteId});
};

export const bulkDeleteNotesForMode = async (mode: NotesStorageMode, ids: string[]): Promise<number> => {
    if (ids.length === 0) {
        return 0;
    }
    if (mode === 'local') {
        const response = await notesBridge.bulkDelete(ids);
        return response.deleted_count ?? 0;
    }
    const deletedCount = await bulkDeleteNotesApi(ids);
    emitNotesEvent({type: 'bulk-deleted', mode, ids});
    return deletedCount;
};

export const deriveNoteTitle = (text: string, limit = 72): string => {
    const trimmed = text.trim();
    if (!trimmed) {
        return 'Untitled note';
    }
    const firstLine = trimmed.split('\n').find((line) => line.trim().length > 0) ?? trimmed;
    const clean = firstLine.trim().replace(/\s+/g, ' ');
    if (clean.length <= limit) {
        return clean;
    }
    return clean.slice(0, limit).trimEnd();
};
