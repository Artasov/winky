import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import type { ActionIcon } from '@shared/types';

const SettingsWindow: React.FC = () => {
  const { config, refreshConfig } = useConfig();
  const { showToast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [iconId, setIconId] = useState('');
  const [saving, setSaving] = useState(false);
  const [icons, setIcons] = useState<ActionIcon[]>([]);
  const [loadingIcons, setLoadingIcons] = useState(false);
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const actions = useMemo(() => config?.actions ?? [], [config?.actions]);
  const isAuthorized = Boolean(config?.auth.accessToken);

  const loadIcons = useCallback(async () => {
    if (loadingIcons || iconsLoaded) {
      console.log('%c[SettingsWindow] %c⏭ Пропуск загрузки иконок (уже загружены или загружаются)', 'color: #3b82f6; font-weight: bold', 'color: #f59e0b');
      return;
    }

    console.log('%c[SettingsWindow] %cЗагрузка иконок...', 'color: #3b82f6; font-weight: bold', 'color: inherit');
    setLoadingIcons(true);
    try {
      const loadedIcons = await window.winky?.icons.fetch();
      console.log('%c[SettingsWindow] %cИконки загружены:', 'color: #3b82f6; font-weight: bold', 'color: inherit', loadedIcons);
      console.log(`%c[SettingsWindow] %cКоличество: ${loadedIcons?.length || 0}`, 'color: #3b82f6; font-weight: bold', 'color: #10b981');
      
      if (loadedIcons && loadedIcons.length > 0) {
        setIcons(loadedIcons);
        setIconId(loadedIcons[0].id);
        setIconsLoaded(true);
        console.log('%c[SettingsWindow] %c✓ Иконки успешно установлены', 'color: #3b82f6; font-weight: bold', 'color: #10b981; font-weight: bold');
      } else {
        console.warn('%c[SettingsWindow] %c⚠ Получен пустой список иконок', 'color: #3b82f6; font-weight: bold', 'color: #f59e0b; font-weight: bold');
        showToast('Список иконок пуст. Добавьте иконки на бекенде.', 'info');
      }
    } catch (error) {
      console.error('%c[SettingsWindow] %c✗ Ошибка загрузки иконок:', 'color: #3b82f6; font-weight: bold', 'color: #ef4444; font-weight: bold', error);
      showToast('Не удалось загрузить иконки.', 'error');
    } finally {
      setLoadingIcons(false);
    }
  }, [loadingIcons, iconsLoaded, showToast]);

  useEffect(() => {
    if (isAuthorized && !iconsLoaded && !loadingIcons) {
      loadIcons();
    }
  }, [isAuthorized, iconsLoaded, loadingIcons, loadIcons]);

  const resetForm = () => {
    setName('');
    setPrompt('');
    if (icons.length > 0) {
      setIconId(icons[0].id);
    }
  };

  const handleCreateAction = async (event: React.FormEvent) => {
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
    console.log('%c[SettingsWindow] %cСоздание действия...', 'color: #3b82f6; font-weight: bold', 'color: inherit', { name: name.trim(), prompt: prompt.trim(), icon: iconId });
    try {
      await window.winky?.actions.create({ name: name.trim(), prompt: prompt.trim(), icon: iconId });
      await refreshConfig();
      console.log('%c[SettingsWindow] %c✓ Действие создано', 'color: #3b82f6; font-weight: bold', 'color: #10b981; font-weight: bold');
      showToast('Действие добавлено.', 'success');
      resetForm();
      setIsFormOpen(false);
    } catch (error: any) {
      console.error('%c[SettingsWindow] %c✗ Ошибка создания действия:', 'color: #3b82f6; font-weight: bold', 'color: #ef4444; font-weight: bold', error);
      const message = error?.response?.data?.detail || error?.message || 'Не удалось создать действие.';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAction = async (actionId: string, actionName: string) => {
    if (!confirm(`Удалить действие "${actionName}"?`)) {
      return;
    }

    setDeletingIds((prev) => new Set(prev).add(actionId));
    console.log('%c[SettingsWindow] %cУдаление действия...', 'color: #3b82f6; font-weight: bold', 'color: inherit', { actionId, actionName });
    try {
      await window.winky?.actions.delete(actionId);
      await refreshConfig();
      console.log('%c[SettingsWindow] %c✓ Действие удалено', 'color: #3b82f6; font-weight: bold', 'color: #10b981; font-weight: bold');
      showToast('Действие удалено.', 'success');
    } catch (error: any) {
      console.error('%c[SettingsWindow] %c✗ Ошибка удаления действия:', 'color: #3b82f6; font-weight: bold', 'color: #ef4444; font-weight: bold', error);
      const message = error?.response?.data?.detail || error?.message || 'Не удалось удалить действие.';
      showToast(message, 'error');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-300">
        Авторизуйтесь, чтобы управлять действиями.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 bg-slate-950 px-6 py-8 text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Настройки</h1>
          <p className="text-sm text-slate-300">Управляйте списком действий, доступных в главном окне.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsFormOpen((prev) => !prev)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          {isFormOpen ? 'Отменить' : 'Добавить действие'}
        </button>
      </div>

      {isFormOpen && (
        <form onSubmit={handleCreateAction} className="rounded-lg border border-white/10 bg-white/5 p-6">
          <div className="fc gap-6">
            {/* Название */}
            <div className="fc gap-2">
              <label className="text-sm font-medium text-slate-200">Название действия</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/50 transition"
                placeholder="Например: Написать email"
              />
            </div>

            {/* Выбор иконки */}
            <div className="fc gap-3">
              <label className="text-sm font-medium text-slate-200">
                Выберите иконку {iconId && <span className="text-slate-400 font-normal">• {icons.find(i => i.id === iconId)?.name}</span>}
              </label>
              {loadingIcons ? (
                <div className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-8 text-center text-slate-400">
                  Загрузка иконок...
                </div>
              ) : icons.length === 0 ? (
                <div className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-8 text-center text-slate-400">
                  Нет доступных иконок. Добавьте их на бекенде.
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {icons.map((iconOption) => (
                    <button
                      key={iconOption.id}
                      type="button"
                      onClick={() => setIconId(iconOption.id)}
                      className={`frc rounded-lg border-2 p-3 transition-all hover:scale-105 ${
                        iconId === iconOption.id
                          ? 'border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/20'
                          : 'border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800'
                      }`}
                      title={iconOption.name}
                    >
                      <img 
                        src={iconOption.svg}
                        alt={iconOption.name}
                        className="w-8 h-8"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Промпт */}
            <div className="fc gap-2">
              <label className="text-sm font-medium text-slate-200">Промпт</label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/50 transition resize-none"
                placeholder="Опишите, что должно делать это действие..."
              />
            </div>
          </div>

          {/* Кнопки */}
          <div className="mt-6 fre gap-3">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
              className="rounded-lg border border-slate-600 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 hover:border-slate-500"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving || loadingIcons || icons.length === 0 || !iconId}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {saving ? 'Сохранение...' : 'Создать действие'}
            </button>
          </div>
        </form>
      )}

      <section className="flex-1 overflow-auto rounded-lg border border-white/10 bg-white/5 p-6">
        <h2 className="mb-5 text-xl font-semibold text-slate-100">Текущие действия</h2>
        {actions.length === 0 ? (
          <div className="fcc rounded-lg border border-dashed border-slate-700 bg-slate-900/50 py-12 text-center">
            <div className="text-4xl mb-3 opacity-50">📝</div>
            <p className="text-sm text-slate-400">Пока нет действий</p>
            <p className="text-xs text-slate-500 mt-1">Добавьте новое, чтобы начать</p>
          </div>
        ) : (
          <ul className="fc gap-3">
            {actions.map((action) => {
              const isDeleting = deletingIds.has(action.id);
              return (
                <li
                  key={action.id}
                  className={`frbc rounded-lg border bg-slate-900/70 px-5 py-4 gap-4 transition ${
                    isDeleting 
                      ? 'opacity-50 border-slate-800' 
                      : 'border-white/10 hover:border-white/20 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="frc gap-3 mb-2">
                      {action.icon_details?.svg ? (
                        <div className="fcc rounded-lg bg-slate-800 p-2 shrink-0">
                          <img 
                            src={action.icon_details.svg}
                            alt=""
                            className="w-6 h-6"
                            aria-hidden="true"
                          />
                        </div>
                      ) : (
                        <div className="fcc rounded-lg bg-slate-800 p-2 text-xl shrink-0">❓</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-slate-100 truncate">{action.name}</h3>
                        <p className="text-xs text-slate-500">{action.icon_details?.name || 'Без иконки'}</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed line-clamp-2">{action.prompt}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAction(action.id, action.name)}
                    disabled={isDeleting}
                    className="rounded-lg border-2 border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:border-red-500 hover:bg-red-500/20 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 shrink-0"
                  >
                    {isDeleting ? 'Удаление...' : 'Удалить'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default SettingsWindow;
