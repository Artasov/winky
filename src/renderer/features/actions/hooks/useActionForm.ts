import {useCallback, useEffect, useMemo, useState} from 'react';
import {z} from 'zod';
import type {ActionConfig} from '@shared/types';
import {getErrorMessage} from '../../../utils/errorMessage';

const formSchema = z.object({
    name: z.string().min(1, 'Enter an action name.'),
    prompt: z.string().optional(),
    promptRecognizing: z.string().optional(),
    hotkey: z.string().optional(),
    iconId: z.string().min(1, 'Choose an icon.'),
    showResults: z.boolean(),
    soundOnComplete: z.boolean(),
    autoCopyResult: z.boolean()
});

export type ActionFormValues = z.infer<typeof formSchema>;

type UseActionFormParams = {
    icons: Array<{ id: string; name: string }>;
    iconsLoading: boolean;
    fetchIcons: () => Promise<Array<{ id: string; name: string }>>;
    isAuthorized: boolean;
    showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
    refreshConfig: () => Promise<unknown>;
};

export const useActionForm = ({
    icons,
    iconsLoading,
    fetchIcons,
    isAuthorized,
    showToast,
    refreshConfig
}: UseActionFormParams) => {
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingActionId, setEditingActionId] = useState<string | null>(null);
    const [mode, setMode] = useState<'create' | 'edit'>('create');
    const [saving, setSaving] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

    const [values, setValues] = useState<ActionFormValues>({
        name: '',
        prompt: '',
        promptRecognizing: '',
        hotkey: '',
        iconId: '',
        showResults: false,
        soundOnComplete: false,
        autoCopyResult: false
    });

    const resetForm = useCallback(() => {
        setValues({
            name: '',
            prompt: '',
            promptRecognizing: '',
            hotkey: '',
            iconId: '',
            showResults: false,
            soundOnComplete: false,
            autoCopyResult: false
        });
        setEditingActionId(null);
    }, []);

    const closeModal = useCallback(() => {
        if (!isModalVisible) {
            return;
        }
        setIsModalVisible(false);
        resetForm();
    }, [isModalVisible, resetForm]);

    const openCreateModal = useCallback(() => {
        setMode('create');
        resetForm();
        setIsModalVisible(true);
    }, [resetForm]);

    const openEditModal = useCallback((action: ActionConfig) => {
        if (action.is_active === false) {
            showToast('This action is inactive and cannot be edited.', 'info');
            return;
        }
        setMode('edit');
        setEditingActionId(action.id);
        setValues({
            name: action.name,
            prompt: action.prompt,
            promptRecognizing: action.prompt_recognizing ?? '',
            hotkey: action.hotkey ?? '',
            iconId: action.icon_details?.id ?? action.icon,
            showResults: action.show_results ?? false,
            soundOnComplete: action.sound_on_complete ?? false,
            autoCopyResult: action.auto_copy_result ?? false
        });
        setIsModalVisible(true);
    }, [showToast]);

    const setField = useCallback(<K extends keyof ActionFormValues>(key: K, value: ActionFormValues[K]) => {
        setValues((prev) => ({
            ...prev,
            [key]: value
        }));
    }, []);

    useEffect(() => {
        if (!isModalVisible) {
            return;
        }

        if (!isAuthorized) {
            showToast('Please sign in to manage actions.', 'error');
            return;
        }

        if (icons.length === 0 && !iconsLoading) {
            void fetchIcons().then((loadedIcons) => {
                if (loadedIcons.length > 0 && !values.iconId) {
                    setField('iconId', loadedIcons[0].id);
                } else if (loadedIcons.length === 0) {
                    showToast('No icons available. Please add them on the backend.', 'info');
                }
            });
        } else if (icons.length > 0 && !values.iconId) {
            setField('iconId', icons[0].id);
        }
    }, [isModalVisible, icons, iconsLoading, values.iconId, fetchIcons, isAuthorized, showToast, setField]);

    const handleSubmit = useCallback(async (event: React.FormEvent) => {
        event.preventDefault();
        const validation = formSchema.safeParse(values);
        if (!validation.success) {
            const firstError = validation.error.errors[0]?.message ?? 'Please complete the form correctly.';
            showToast(firstError, 'error');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: validation.data.name.trim(),
                prompt: validation.data.prompt?.trim() ?? '',
                prompt_recognizing: validation.data.promptRecognizing?.trim() ?? '',
                hotkey: validation.data.hotkey?.trim() ?? '',
                icon: validation.data.iconId,
                show_results: validation.data.showResults,
                sound_on_complete: validation.data.soundOnComplete,
                auto_copy_result: validation.data.autoCopyResult
            };

            if (editingActionId) {
                await window.winky?.actions.update(editingActionId, payload);
            } else {
                await window.winky?.actions.create(payload);
            }

            await refreshConfig();
            showToast(editingActionId ? 'Action updated.' : 'Action created.', 'success');
            closeModal();
        } catch (error: any) {
            console.error('[ActionsPage] Ошибка сохранения действия', error);
            const message = getErrorMessage(error, 'Failed to save the action.');
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    }, [values, editingActionId, closeModal, refreshConfig, showToast]);

    const handleDelete = useCallback(async (actionId: string, actionName: string) => {
        if (deletingIds.has(actionId)) {
            return;
        }

        if (!confirm(`Delete the action "${actionName}"?`)) {
            return;
        }

        setDeletingIds((prev) => new Set(prev).add(actionId));
        try {
            await window.winky?.actions.delete(actionId);
            await refreshConfig();
            showToast('Action deleted.', 'success');
        } catch (error: any) {
            console.error('[ActionsPage] Ошибка удаления действия', error);
            const message = getErrorMessage(error, 'Failed to delete the action.');
            showToast(message, 'error');
        } finally {
            setDeletingIds((prev) => {
                const next = new Set(prev);
                next.delete(actionId);
                return next;
            });
        }
    }, [deletingIds, refreshConfig, showToast]);

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
        editingActionId,
        saving,
        deletingIds,
        handleSubmit,
        handleDelete
    };
};
