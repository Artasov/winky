import React, { useMemo, useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';

const iconOptions = ['📝', '💡', '📧', '🔍', '⚙️', '🗒️'];

const SettingsWindow: React.FC = () => {
  const { config, refreshConfig } = useConfig();
  const { showToast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [icon, setIcon] = useState(iconOptions[0]);
  const [saving, setSaving] = useState(false);

  const actions = useMemo(() => config?.actions ?? [], [config?.actions]);
  const isAuthorized = Boolean(config?.auth.accessToken);

  const resetForm = () => {
    setName('');
    setPrompt('');
    setIcon(iconOptions[0]);
  };

  const handleCreateAction = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name || !prompt) {
      showToast('Заполните название и промпт действия.', 'error');
      return;
    }

    setSaving(true);
    try {
      await window.winky?.actions.create({ name, prompt, icon });
      await refreshConfig();
      showToast('Действие добавлено.', 'success');
      resetForm();
      setIsFormOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Не удалось создать действие.', 'error');
    } finally {
      setSaving(false);
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
        <form onSubmit={handleCreateAction} className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Название действия
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-300">
              Иконка
              <select
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                {iconOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2 flex flex-col gap-2 text-sm text-slate-300">
              Промпт
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
              className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </form>
      )}

      <section className="flex-1 overflow-auto rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="mb-4 text-lg font-semibold">Текущие действия</h2>
        {actions.length === 0 ? (
          <p className="text-sm text-slate-300">Пока нет действий. Добавьте новое, чтобы начать.</p>
        ) : (
          <ul className="space-y-3">
            {actions.map((action) => (
              <li
                key={action.id}
                className="flex items-start justify-between rounded-md border border-white/10 bg-slate-900/70 px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-lg" aria-hidden="true">
                      {action.icon}
                    </span>
                    {action.name}
                  </div>
                  <p className="mt-2 text-xs text-slate-300">{action.prompt}</p>
                </div>
                <span className="text-xs text-slate-400">ID: {action.id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default SettingsWindow;
