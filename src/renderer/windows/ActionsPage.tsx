import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionConfig, ActionIcon } from '@shared/types';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';

const ActionsPage: React.FC = () => {
  const { config, refreshConfig } = useConfig();
  const { showToast } = useToast();
  const actions = useMemo(() => config?.actions ?? [], [config?.actions]);
  const isAuthorized = Boolean(config?.auth.accessToken);

  const MODAL_ANIMATION_MS = 180;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [iconId, setIconId] = useState('');
  const [icons, setIcons] = useState<ActionIcon[]>([]);
  const [iconsLoading, setIconsLoading] = useState(false);
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const closeTimeoutRef = useRef<number | null>(null);

  const resetForm = useCallback(() => {
    setName('');
    setPrompt('');
    setIconId('');
    setEditingActionId(null);
  }, []);

  const loadIcons = useCallback(async () => {
    if (iconsLoading || iconsLoaded) {
      return;
    }
    setIconsLoading(true);
    try {
      const loaded = await window.winky?.icons.fetch();
      if (loaded && loaded.length > 0) {
        setIcons(loaded);
        setIconsLoaded(true);
        if (!iconId) {
          setIconId(loaded[0].id);
        }
      } else {
        showToast('Нет доступных иконок. Добавьте их на бекенде.', 'info');
      }
    } catch (error) {
      console.error('[ActionsPage] Не удалось загрузить иконки', error);
      showToast('Не удалось загрузить иконки.', 'error');
    } finally {
      setIconsLoading(false);
    }
  }, [iconId, iconsLoaded, iconsLoading, showToast]);

  useEffect(() => {
    if (isModalVisible) {
      void loadIcons();
    }
  }, [isModalVisible, loadIcons]);

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

  const openEditModal = (action: ActionConfig) => {
    setEditingActionId(action.id);
    setName(action.name);
    setPrompt(action.prompt);
    setIconId(action.icon_details?.id ?? action.icon);
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
    if (!name.trim() || !prompt.trim()) {
      showToast('Заполните название и промпт действия.', 'error');
      return;
    }
    if (!iconId) {
      showToast('Выберите иконку.', 'error');
      return;
    }

    setSaving(true);
    const originalAction = editingActionId ? actions.find((action) => action.id === editingActionId) : null;

    try {
      if (editingActionId && originalAction) {
        await window.winky?.actions.delete(editingActionId);
      }

      await window.winky?.actions.create({
        name: name.trim(),
        prompt: prompt.trim(),
        icon: iconId
      });
      await refreshConfig();
      showToast(editingActionId ? 'Действие обновлено.' : 'Действие добавлено.', 'success');
      beginModalClose();
    } catch (error: any) {
      console.error('[ActionsPage] Ошибка сохранения действия', error);
      if (editingActionId && originalAction) {
        try {
          await window.winky?.actions.create({
            name: originalAction.name,
            prompt: originalAction.prompt,
            icon: originalAction.icon_details?.id ?? originalAction.icon
          });
          await refreshConfig();
        } catch (restoreError) {
          console.error('[ActionsPage] Не удалось восстановить исходное действие после ошибки', restoreError);
        }
      }
      const message = error?.response?.data?.detail || error?.message || 'Не удалось сохранить действие.';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-8 px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-white">Действия</h1>
          <p className="text-sm text-slate-400">Управляйте быстрыми сценариями для голосового ассистента.</p>
        </div>
        {isAuthorized && (
          <button
            type="button"
            onClick={openCreateModal}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/20 text-emerald-200 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-500/30 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
            aria-label="Добавить действие"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M9 3a1 1 0 1 1 2 0v6h6a1 1 0 0 1 0 2h-6v6a1 1 0 1 1-2 0v-6H3a1 1 0 1 1 0-2h6V3z" />
            </svg>
          </button>
        )}
      </div>

      {!isAuthorized ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 px-6 py-16 text-center">
          <div className="text-4xl opacity-60">⚡</div>
          <p className="text-sm text-slate-300">Авторизуйтесь, чтобы управлять действиями.</p>
        </div>
      ) : actions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 px-6 py-16 text-center">
          <div className="text-4xl opacity-60">⚡</div>
          <p className="text-sm text-slate-300">Нет действий</p>
          <p className="text-xs text-slate-500">Нажмите на «плюс», чтобы создать первое действие.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {actions.map((action) => {
            const isDeleting = deletingIds.has(action.id);
            return (
              <div
                key={action.id}
                className="group relative flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-6 transition hover:border-white/10 hover:bg-white/10"
              >
                <div className="absolute right-3 top-3 hidden gap-2 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => openEditModal(action)}
                    className="pointer-events-auto rounded-md border border-white/30 bg-slate-900/60 px-2 py-1 text-xs font-semibold text-slate-100 transition hover:border-white/60 hover:bg-slate-900"
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(action.id, action.name)}
                    disabled={isDeleting}
                    className="pointer-events-auto rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-300 transition hover:border-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? '...' : 'Удалить'}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {action.icon_details?.svg ? (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/60">
                      <img
                        src={action.icon_details.svg}
                        alt={action.icon_details.name || ''}
                        className="h-8 w-8"
                      />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/60 text-2xl">⚡</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-white">{action.name}</h3>
                    <p className="text-xs text-slate-500">{action.icon_details?.name || 'Без иконки'}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-300 line-clamp-3">{action.prompt}</p>
              </div>
            );
          })}
        </div>
      )}

      {isModalVisible && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-6 py-10">
          <div
            className={`w-full max-w-xl origin-center rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl backdrop-blur ${
              isModalClosing ? 'animate-modal-out' : 'animate-modal-in'
            }`}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {editingActionId ? 'Изменить действие' : 'Новое действие'}
                </h2>
                <p className="text-sm text-slate-400">
                  Укажите название, промпт и иконку для действия.
                </p>
              </div>
              <button
                type="button"
                onClick={beginModalClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-slate-300 transition hover:border-white/40 hover:text-white"
                aria-label="Закрыть форму"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                  <path d="M1.28 0 0 1.28 4.72 6 0 10.72 1.28 12 6 7.28 10.72 12 12 10.72 7.28 6 12 1.28 10.72 0 6 4.72Z" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-200" htmlFor="action-name">Название</label>
                <input
                  id="action-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                  placeholder="Например: Написать email"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-200" htmlFor="action-prompt">Промпт</label>
                <textarea
                  id="action-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={5}
                  className="resize-none rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                  placeholder="Опишите, что должно делать действие"
                />
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-slate-200">
                  Иконка {iconId && <span className="font-normal text-slate-400">• {icons.find((iconOption) => iconOption.id === iconId)?.name}</span>}
                </label>
                {iconsLoading ? (
                  <div className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-6 text-center text-slate-400">
                    Загрузка иконок...
                  </div>
                ) : icons.length === 0 ? (
                  <div className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-6 text-center text-slate-400">
                    Нет доступных иконок.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {icons.map((iconOption) => (
                      <button
                        key={iconOption.id}
                        type="button"
                        onClick={() => setIconId(iconOption.id)}
                        className={`flex items-center justify-center rounded-lg border-2 p-3 transition-all hover:scale-105 ${
                          iconId === iconOption.id
                            ? 'border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/20'
                            : 'border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800'
                        }`}
                        aria-pressed={iconId === iconOption.id}
                        title={iconOption.name}
                      >
                        <img src={iconOption.svg} alt={iconOption.name} className="h-8 w-8" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={beginModalClose}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 hover:border-slate-500"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving || iconsLoading || icons.length === 0 || !iconId}
                  className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {saving ? 'Сохранение...' : editingActionId ? 'Сохранить изменения' : 'Создать действие'}
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

