import type {ActionConfig, ActionIcon} from '@shared/types';
import {
    fetchActions,
    createAction,
    updateAction,
    deleteAction,
    fetchIcons,
    ActionPayload
} from '../services/winkyApi';

export const actionsBridge = {
    fetch: (): Promise<ActionConfig[]> => fetchActions(),
    create: (payload: ActionPayload): Promise<ActionConfig[]> => createAction(payload),
    update: (id: string, payload: ActionPayload): Promise<ActionConfig[]> => updateAction(id, payload),
    delete: (id: string): Promise<ActionConfig[]> => deleteAction(id)
};

export const iconsBridge = {
    fetch: (): Promise<ActionIcon[]> => fetchIcons()
};

export type ActionsBridge = typeof actionsBridge;
export type IconsBridge = typeof iconsBridge;
