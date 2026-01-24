import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import type {ActionGroup} from '@shared/types';
import {getErrorMessage} from '../../../utils/errorMessage';
import type {GroupFormValues} from '../components/GroupForm';

type UseGroupFormParams = {
    icons: Array<{id: string; name: string}>;
    iconsLoading: boolean;
    fetchIcons: () => Promise<Array<{id: string; name: string}>>;
    isAuthorized: boolean;
    showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
    refreshConfig: () => Promise<unknown>;
};

const DEFAULT_VALUES: GroupFormValues = {
    name: '',
    description: '',
    color: '#f43f5e',
    iconId: '',
    priority: 0
};

export const useGroupForm = ({
    icons,
    iconsLoading,
    fetchIcons,
    isAuthorized,
    showToast,
    refreshConfig
}: UseGroupFormParams) => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [mode, setMode] = useState<'create' | 'edit'>('create');
    const [saving, setSaving] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [pendingDelete, setPendingDelete] = useState<{id: string; name: string} | null>(null);
    const [values, setValues] = useState<GroupFormValues>(DEFAULT_VALUES);

    const resetForm = useCallback(() => {
        setValues(DEFAULT_VALUES);
        setEditingGroupId(null);
    }, []);

    const closeModal = useCallback(() => {
        if (!isModalVisible) return;
        setIsModalVisible(false);
        setTimeout(resetForm, 300);
    }, [isModalVisible, resetForm]);

    const openCreateModal = useCallback(() => {
        setMode('create');
        resetForm();
        setIsModalVisible(true);
    }, [resetForm]);

    const openEditModal = useCallback((group: ActionGroup) => {
        setMode('edit');
        setEditingGroupId(group.id);
        setValues({
            name: group.name,
            description: group.description || '',
            color: group.color || '#f43f5e',
            iconId: group.icon_details?.id || group.icon,
            priority: group.priority ?? 0
        });
        setIsModalVisible(true);
    }, []);

    const setField = useCallback(<K extends keyof GroupFormValues>(key: K, value: GroupFormValues[K]) => {
        setValues((prev) => ({...prev, [key]: value}));
    }, []);

    useEffect(() => {
        if (!isModalVisible) return;
        if (!isAuthorized) {
            showToast('Please sign in to manage groups.', 'error');
            return;
        }
        if (icons.length === 0 && !iconsLoading) {
            void fetchIcons().then((loadedIcons) => {
                if (loadedIcons.length > 0 && !values.iconId) {
                    setField('iconId', loadedIcons[0].id);
                }
            });
        } else if (icons.length > 0 && !values.iconId) {
            setField('iconId', icons[0].id);
        }
    }, [isModalVisible, icons, iconsLoading, values.iconId, fetchIcons, isAuthorized, showToast, setField]);

    const handleSubmit = useCallback(async (event: FormEvent) => {
        event.preventDefault();
        if (!values.name.trim()) {
            showToast('Enter a group name.', 'error');
            return;
        }
        if (!values.iconId) {
            showToast('Choose an icon.', 'error');
            return;
        }

        setSaving(true);
        try {
            if (editingGroupId) {
                await window.winky?.groups.update(editingGroupId, {
                    name: values.name.trim(),
                    description: values.description.trim(),
                    color: values.color,
                    icon: values.iconId,
                    priority: values.priority
                });
            } else {
                await window.winky?.groups.create({
                    name: values.name.trim(),
                    description: values.description.trim(),
                    color: values.color,
                    icon: values.iconId,
                    priority: values.priority
                });
            }

            await refreshConfig();
            showToast(editingGroupId ? 'Group updated.' : 'Group created.', 'success');
            closeModal();
        } catch (error: any) {
            console.error('[useGroupForm] Error saving group', error);
            const message = getErrorMessage(error, 'Failed to save the group.');
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    }, [values, editingGroupId, closeModal, refreshConfig, showToast]);

    const handleDeleteConfirmed = useCallback(async (groupId: string, groupName: string) => {
        if (deletingIds.has(groupId)) return;

        setDeletingIds((prev) => new Set(prev).add(groupId));
        try {
            await window.winky?.groups.delete(groupId);
            await refreshConfig();
            showToast(`Group "${groupName}" deleted.`, 'success');
        } catch (error: any) {
            console.error('[useGroupForm] Error deleting group', error);
            const message = getErrorMessage(error, 'Failed to delete the group.');
            showToast(message, 'error');
        } finally {
            setDeletingIds((prev) => {
                const next = new Set(prev);
                next.delete(groupId);
                return next;
            });
            setPendingDelete(null);
        }
    }, [deletingIds, refreshConfig, showToast]);

    const requestDelete = useCallback((groupId: string, groupName: string) => {
        if (deletingIds.has(groupId)) return;
        setPendingDelete({id: groupId, name: groupName});
    }, [deletingIds]);

    const confirmDelete = useCallback(() => {
        if (pendingDelete) {
            void handleDeleteConfirmed(pendingDelete.id, pendingDelete.name);
        }
    }, [handleDeleteConfirmed, pendingDelete]);

    const cancelDelete = useCallback(() => setPendingDelete(null), []);

    const modalProps = useMemo(() => ({
        isModalVisible,
        closeModal
    }), [isModalVisible, closeModal]);

    return {
        values,
        setField,
        modal: modalProps,
        mode,
        openCreateModal,
        openEditModal,
        editingGroupId,
        saving,
        deletingIds,
        pendingDelete,
        handleSubmit,
        handleDelete: requestDelete,
        confirmDelete,
        cancelDelete
    };
};
