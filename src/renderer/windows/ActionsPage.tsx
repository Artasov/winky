import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ActionConfig, ActionIcon} from '@shared/types';
import {useConfig} from '../context/ConfigContext';
import {useIcons} from '../context/IconsContext';
import {useToast} from '../context/ToastContext';

const ActionsPage: React.FC = () => {
    const {config, refreshConfig} = useConfig();
    const {icons, loading: iconsLoading, fetchIcons} = useIcons();
    const {showToast} = useToast();
    const actions = useMemo(() => config?.actions ?? [], [config?.actions]);
    const isAuthorized = Boolean(config?.auth.accessToken);

    const MODAL_ANIMATION_MS = 180;
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isModalClosing, setIsModalClosing] = useState(false);
    const [editingActionId, setEditingActionId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [iconId, setIconId] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [soundOnComplete, setSoundOnComplete] = useState(false);
    const [autoCopyResult, setAutoCopyResult] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const closeTimeoutRef = useRef<number | null>(null);

    const resetForm = useCallback(() => {
        setName('');
        setPrompt('');
        setIconId('');
        setShowResults(false);
        setSoundOnComplete(false);
        setAutoCopyResult(false);
        setEditingActionId(null);
    }, []);

    // Загружаем иконки при открытии модалки
    useEffect(() => {
        if (!isModalVisible) {
            return;
        }

        if (!isAuthorized) {
            showToast('Please sign in to manage actions.', 'error');
            return;
        }

        if (icons.length === 0 && !iconsLoading) {
            console.log('[ActionsPage] Fetching icons for modal...');
            void fetchIcons().then((loadedIcons) => {
                if (loadedIcons.length > 0 && !iconId) {
                    setIconId(loadedIcons[0].id);
                } else if (loadedIcons.length === 0) {
                    showToast('No icons available. Please add them on the backend.', 'info');
                }
            });
        } else if (icons.length > 0 && !iconId) {
            // Иконки уже загружены, просто устанавливаем первую
            setIconId(icons[0].id);
        }
    }, [isModalVisible, icons, iconsLoading, iconId, fetchIcons, isAuthorized, showToast]);

    useEffect(() => () => {
        if (closeTimeoutRef.current) {
            window.clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, []);

    const beginModalClose = useCallback(() => {
        if (!isModalVisible || isModalClosing) {
            return;
        }
        if (closeTimeoutRef.current) {
            window.clearTimeout(closeTimeoutRef.current);
        }
        setIsModalClosing(true);
        closeTimeoutRef.current = window.setTimeout(() => {
            setIsModalClosing(false);
            setIsModalVisible(false);
            closeTimeoutRef.current = null;
            resetForm();
        }, MODAL_ANIMATION_MS);
    }, [isModalClosing, isModalVisible, resetForm]);

    const openCreateModal = () => {
        if (closeTimeoutRef.current) {
            window.clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        resetForm();
        setIsModalClosing(false);
        setIsModalVisible(true);
    };

    const handleOverlayMouseDown = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) {
                beginModalClose();
            }
        },
        [beginModalClose]
    );

    const openEditModal = (action: ActionConfig) => {
        setEditingActionId(action.id);
        setName(action.name);
        setPrompt(action.prompt);
        setIconId(action.icon_details?.id ?? action.icon);
        setShowResults(action.show_results ?? false);
        setSoundOnComplete(action.sound_on_complete ?? false);
        setAutoCopyResult(action.auto_copy_result ?? false);
        if (closeTimeoutRef.current) {
            window.clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setIsModalClosing(false);
        setIsModalVisible(true);
    };

    const handleDelete = async (actionId: string, actionName: string) => {
        if (deletingIds.has(actionId)) {
            return;
        }

        if (!confirm(`Удалить действие "${actionName}"?`)) {
            return;
        }

        setDeletingIds((prev) => new Set(prev).add(actionId));
        try {
            await window.winky?.actions.delete(actionId);
            await refreshConfig();
            showToast('Действие удалено.', 'success');
        } catch (error) {
            console.error('[ActionsPage] Ошибка удаления действия', error);
            showToast('Не удалось удалить действие.', 'error');
        } finally {
            setDeletingIds((prev) => {
                const next = new Set(prev);
                next.delete(actionId);
                return next;
            });
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) {
            showToast('Заполните название действия.', 'error');
            return;
        }
        if (!iconId) {
            showToast('Выберите иконку.', 'error');
            return;
        }

        setSaving(true);

        try {
            const actionData = {
                name: name.trim(),
                prompt: prompt.trim(),
                icon: iconId,
                show_results: showResults,
                sound_on_complete: soundOnComplete,
                auto_copy_result: autoCopyResult
            };

            if (editingActionId) {
                await window.winky?.actions.update(editingActionId, actionData);
            } else {
                await window.winky?.actions.create(actionData);
            }

            await refreshConfig();
            showToast(editingActionId ? 'Действие обновлено.' : 'Действие добавлено.', 'success');
            beginModalClose();
        } catch (error: any) {
            console.error('[ActionsPage] Ошибка сохранения действия', error);
            const message = error?.response?.data?.detail || error?.message || 'Не удалось сохранить действие.';
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 px-8 py-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-semibold text-text-primary">Actions</h1>
                    <p className="text-sm text-text-secondary">Manage quick scenarios for your voice assistant.</p>
                </div>
                {isAuthorized && (
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary shadow-primary-sm transition-[background-color,border-color,color] duration-base hover:border-primary hover:bg-primary-100 hover:text-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                        aria-label="Add action"
                    >
                        <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
                            <path d="M9 3a1 1 0 1 1 2 0v6h6a1 1 0 0 1 0 2h-6v6a1 1 0 1 1-2 0v-6H3a1 1 0 1 1 0-2h6V3z"/>
                        </svg>
                    </button>
                )}
            </div>

            {!isAuthorized ? (
                <div
                    className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary-200 bg-bg-secondary px-6 py-16 text-center">
                    <div className="text-4xl opacity-60">⚡</div>
                    <p className="text-sm text-text-secondary">Please sign in to manage actions.</p>
                </div>
            ) : actions.length === 0 ? (
                <div
                    className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary-200 bg-bg-secondary px-6 py-16 text-center">
                    <div className="text-4xl opacity-60">⚡</div>
                    <p className="text-sm text-text-secondary">No actions</p>
                    <p className="text-xs text-text-tertiary">Click the "plus" button to create your first action.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {actions.map((action) => {
                        const isDeleting = deletingIds.has(action.id);
                        return (
                            <div
                                key={action.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => openEditModal(action)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openEditModal(action);
                                    }
                                }}
                                className="card-animated group relative flex flex-col gap-3 rounded-2xl border border-primary-200 bg-white p-3 shadow-primary-sm transition-all duration-base hover:border-primary hover:shadow-primary-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                            >
                                <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity duration-base group-hover:opacity-100">
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(action.id, action.name)}
                                        disabled={isDeleting}
                                        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary-50 text-primary transition-[background-color,border-color] duration-base hover:border-primary-dark hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-light"
                                        aria-label="Delete action"
                                    >
                                        {isDeleting ? (
                                            <span className="text-xs">...</span>
                                        ) : (
                                            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current"
                                                 aria-hidden="true">
                                                <path fillRule="evenodd"
                                                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                                      clipRule="evenodd"/>
                                            </svg>
                                        )}
                                    </button>
                                </div>

                                <div className="flex items-center gap-3">
                                    {action.icon_details?.svg ? (
                                        <div
                                            className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-secondary">
                                            <img
                                                src={action.icon_details.svg}
                                                alt={action.icon_details.name || ''}
                                                className="h-8 w-8"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-secondary text-2xl">⚡</div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-base font-semibold text-text-primary">{action.name}</h3>
                                        <p className="text-xs text-text-tertiary">{action.icon_details?.name || 'No icon'}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {isModalVisible && (
                <div
                    className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-6 py-10"
                    onMouseDown={handleOverlayMouseDown}
                    role="presentation"
                >
                    <div
                        className={`w-full max-w-xl max-h-[90vh] origin-center rounded-2xl border border-primary-200 bg-white shadow-primary-xl flex flex-col ${
                            isModalClosing ? 'animate-modal-out' : 'animate-modal-in'
                        }`}
                    >
                        <div className="frb flex-shrink-0 p-6 pb-4 gap-3">
                            <div>
                                <h2 className="text-xl font-semibold text-text-primary">
                                    {editingActionId ? 'Edit Action' : 'New Action'}
                                </h2>
                                <p className="text-sm text-text-secondary">
                                    Specify the name, prompt, and icon for the action.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={beginModalClose}
                                className="frcc button-animated h-8 w-8 rounded-lg border border-primary-200 text-text-secondary transition-all duration-base hover:border-primary hover:text-primary flex-shrink-0"
                                aria-label="Close form"
                            >
                                <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                                    <path
                                        d="M1.28 0 0 1.28 4.72 6 0 10.72 1.28 12 6 7.28 10.72 12 12 10.72 7.28 6 12 1.28 10.72 0 6 4.72Z"/>
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="fc gap-3 overflow-y-auto px-6 pb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-text-primary"
                                       htmlFor="action-name">Name</label>
                                <input
                                    id="action-name"
                                    type="text"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    className="input-animated rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
                                    placeholder="For example: Write email"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-text-primary"
                                       htmlFor="action-prompt">Prompt</label>
                                <textarea
                                    id="action-prompt"
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    rows={4}
                                    className="input-animated resize-none rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
                                    placeholder="Describe what the action should do (leave empty if you only need transcription)"
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-text-primary">Settings</label>
                                <div className="flex flex-col gap-2">
                                    <label className="frsc gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showResults}
                                            onChange={(e) => setShowResults(e.target.checked)}
                                            className="winky-checkbox"
                                        />
                                        <span className="text-sm text-text-primary">Show results window</span>
                                    </label>
                                    <label className="frsc gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={soundOnComplete}
                                            onChange={(e) => setSoundOnComplete(e.target.checked)}
                                            className="winky-checkbox"
                                        />
                                        <span className="text-sm text-text-primary">Play sound on completion</span>
                                    </label>
                                    <label className="frsc gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoCopyResult}
                                            onChange={(e) => setAutoCopyResult(e.target.checked)}
                                            className="winky-checkbox"
                                        />
                                        <span className="text-sm text-text-primary">Automatically copy result</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <label className="text-sm font-medium text-text-primary">
                                    Icon {iconId && <span
                                    className="font-normal text-text-tertiary">• {icons.find((iconOption) => iconOption.id === iconId)?.name}</span>}
                                </label>
                                {iconsLoading ? (
                                    <div
                                        className="rounded-lg border border-primary-200 bg-bg-secondary px-4 py-6 text-center text-text-secondary">
                                        <div className="animate-pulse-soft">Loading icons...</div>
                                    </div>
                                ) : icons.length === 0 ? (
                                    <div
                                        className="rounded-lg border border-primary-200 bg-bg-secondary px-4 py-6 text-center text-text-secondary">
                                        No icons available.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                                        {icons.map((iconOption) => {
                                            const isSelected = iconId === iconOption.id;
                                            return (
                                                <button
                                                    key={iconOption.id}
                                                    type="button"
                                                    onClick={() => setIconId(iconOption.id)}
                                                    className={`flex items-center justify-center rounded-lg border-2 p-2 transition-all duration-base ${
                                                        isSelected
                                                            ? 'border-primary bg-primary-50 shadow-primary-sm'
                                                            : 'border-primary-200 bg-white hover:border-primary hover:bg-primary-50'
                                                    }`}
                                                    title={iconOption.name}
                                                >
                                                    <img src={iconOption.svg} alt={iconOption.name} className="h-7 w-7"/>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={beginModalClose}
                                    className="button-secondary rounded-lg border border-primary-200 bg-white px-5 py-2.5 text-sm font-semibold text-text-primary transition-all duration-base hover:bg-primary-50 hover:border-primary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || iconsLoading || icons.length === 0 || !iconId}
                                    className="button-primary rounded-lg px-6 py-2.5 text-sm font-semibold shadow-primary-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                                >
                                    {saving ? 'Saving...' : editingActionId ? 'Save Changes' : 'Create Action'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActionsPage;
