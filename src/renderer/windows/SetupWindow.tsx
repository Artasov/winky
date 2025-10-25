import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LLM_MODES, SPEECH_MODES } from '@shared/constants';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';

const SetupWindow: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [speechMode, setSpeechMode] = useState(config?.speech.mode ?? SPEECH_MODES.API);
  const [llmMode, setLlmMode] = useState(config?.llm.mode ?? LLM_MODES.API);
  const [openaiKey, setOpenaiKey] = useState(config?.apiKeys.openai ?? '');
  const [googleKey, setGoogleKey] = useState(config?.apiKeys.google ?? '');
  const [saving, setSaving] = useState(false);

  const requiresOpenAIKey = useMemo(() => llmMode === LLM_MODES.API, [llmMode]);
  const requiresGoogleKey = useMemo(() => speechMode === SPEECH_MODES.API, [speechMode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (requiresOpenAIKey && !openaiKey) {
      showToast('Укажите OpenAI API Key для работы в режиме API.', 'error');
      return;
    }

    if (requiresGoogleKey && !googleKey) {
      showToast('Укажите Google API Key для режима API распознавания речи.', 'error');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateConfig({
        setupCompleted: true,
        speech: { mode: speechMode },
        llm: { mode: llmMode },
        apiKeys: { openai: openaiKey, google: googleKey }
      });
      showToast('Настройки сохранены', 'success');
      if (updated.actions.length === 0) {
        await window.winky.actions.fetch().catch(() => null);
      }
      navigate('/main');
    } catch (error) {
      console.error(error);
      showToast('Не удалось сохранить настройки.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-200">
        Конфигурация не загружена.
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h2 className="text-3xl font-semibold text-white">Первичная настройка</h2>
        <p className="mt-2 text-sm text-slate-300">
          Выберите режимы работы сервисов распознавания речи и LLM, укажите ключи API при необходимости.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <section className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="mb-3 text-lg font-semibold text-white">Распознавание речи</h3>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input
                type="radio"
                name="speechMode"
                value={SPEECH_MODES.API}
                checked={speechMode === SPEECH_MODES.API}
                onChange={() => setSpeechMode(SPEECH_MODES.API)}
                className="text-emerald-500 focus:ring-emerald-400"
              />
              Использовать API сервер
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input
                type="radio"
                name="speechMode"
                value={SPEECH_MODES.LOCAL}
                checked={speechMode === SPEECH_MODES.LOCAL}
                onChange={() => setSpeechMode(SPEECH_MODES.LOCAL)}
                className="text-emerald-500 focus:ring-emerald-400"
              />
              Работать локально
            </label>
          </div>
          {requiresGoogleKey && (
            <div className="mt-4">
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                Google API Key
                <input
                  type="text"
                  value={googleKey}
                  onChange={(event) => setGoogleKey(event.target.value)}
                  className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </label>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="mb-3 text-lg font-semibold text-white">LLM сервис</h3>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input
                type="radio"
                name="llmMode"
                value={LLM_MODES.API}
                checked={llmMode === LLM_MODES.API}
                onChange={() => setLlmMode(LLM_MODES.API)}
                className="text-emerald-500 focus:ring-emerald-400"
              />
              Использовать API сервер
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input
                type="radio"
                name="llmMode"
                value={LLM_MODES.LOCAL}
                checked={llmMode === LLM_MODES.LOCAL}
                onChange={() => setLlmMode(LLM_MODES.LOCAL)}
                className="text-emerald-500 focus:ring-emerald-400"
              />
              Работать локально
            </label>
          </div>
          {requiresOpenAIKey && (
            <div className="mt-4">
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                OpenAI API Key
                <input
                  type="text"
                  value={openaiKey}
                  onChange={(event) => setOpenaiKey(event.target.value)}
                  className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </label>
            </div>
          )}
        </section>

        <button
          type="submit"
          disabled={saving}
          className="self-end rounded-lg bg-emerald-600 px-6 py-2 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Сохраняем...' : 'Готово'}
        </button>
      </form>
    </div>
  );
};

export default SetupWindow;
