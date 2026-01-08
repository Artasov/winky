import type {ActionConfig, ActionIcon} from '@shared/types';
import {
    fetchActions,
    createAction,
    updateAction,
    deleteAction,
    fetchIcons,
    ActionCreatePayload,
    ActionUpdatePayload
} from '../services/winkyApi';

export const actionsBridge = {
    fetch: (): Promise<ActionConfig[]> => fetchActions(),
    create: (payload: ActionCreatePayload): Promise<ActionConfig[]> => createAction(payload),
    update: (id: string, payload: ActionUpdatePayload): Promise<ActionConfig[]> => updateAction(id, payload),
    delete: (id: string): Promise<ActionConfig[]> => deleteAction(id)
};

export const iconsBridge = {
    fetch: (): Promise<ActionIcon[]> => fetchIcons()
};
