import React, { useEffect, useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';

const SettingsPage: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const { showToast } = useToast();
  const [openaiKey, setOpenaiKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [saving, setSaving] = useState(false);

  const isAuthorized = Boolean(config?.auth.accessToken);

  useEffect(() => {
    if (config) {
      setOpenaiKey(config.apiKeys.openai ?? '');
      setGoogleKey(config.apiKeys.google ?? '');
    }
  }, [config]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateConfig({
        apiKeys: {
          openai: openaiKey.trim(),
          google: googleKey.trim()
        }
      });
      showToast('Ключи сохранены.', 'success');
    } catch (error) {
      console.error('[SettingsPage] Не удалось сохранить ключи', error);
      showToast('Не удалось сохранить ключи API.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-4 px-8 py-12 text-center">
        <div className="text-4xl opacity-60">🔐</div>
        <p className="text-sm text-slate-300">Авторизуйтесь, чтобы изменить настройки.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-white">Настройки</h1>
        <p className="text-sm text-slate-400">Управляйте подключением к внешним сервисам.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">API ключи</h2>
        <p className="text-sm text-slate-400">
          Эти ключи используются для распознавания речи (Google) и работы с LLM (OpenAI). Оставьте поле пустым, если
          планируете работать в локальном режиме.
        </p>

        <label className="flex flex-col gap-2 text-sm text-slate-200" htmlFor="google-key">
          Google AI Key
          <input
            id="google-key"
            type="text"
            value={googleKey}
            onChange={(event) => setGoogleKey(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
            placeholder="AIza..."
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-200" htmlFor="openai-key">
          OpenAI API Key
          <input
            id="openai-key"
            type="text"
            value={openaiKey}
            onChange={(event) => setOpenaiKey(event.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
            placeholder="sk-..."
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-500 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
