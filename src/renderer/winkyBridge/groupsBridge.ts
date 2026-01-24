import type {ActionGroup} from '@shared/types';
import {
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addActionToGroup,
    removeActionFromGroup,
    GroupCreatePayload,
    GroupUpdatePayload
} from '../services/winkyApi';

export const groupsBridge = {
    fetch: (): Promise<ActionGroup[]> => fetchGroups(),
    create: (payload: GroupCreatePayload): Promise<ActionGroup[]> => createGroup(payload),
    update: (id: string, payload: GroupUpdatePayload): Promise<ActionGroup[]> => updateGroup(id, payload),
    delete: (id: string): Promise<ActionGroup[]> => deleteGroup(id),
    addAction: (groupId: string, actionId: string): Promise<ActionGroup[]> => addActionToGroup(groupId, actionId),
    removeAction: (groupId: string, actionId: string): Promise<ActionGroup[]> => removeActionFromGroup(groupId, actionId)
};
