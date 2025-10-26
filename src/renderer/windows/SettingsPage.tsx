import React, { useEffect, useMemo, useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { LLM_API_MODELS, LLM_LOCAL_MODELS, LLM_MODES, SPEECH_API_MODELS, SPEECH_LOCAL_MODELS, SPEECH_MODES } from '@shared/constants';
import type { LLMModel, LLMMode, SpeechModel, SpeechMode } from '@shared/types';

const SettingsPage: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const { showToast } = useToast();
  const [openaiKey, setOpenaiKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [speechMode, setSpeechMode] = useState<SpeechMode>(SPEECH_MODES.API);
  const [speechModel, setSpeechModel] = useState<SpeechModel>(SPEECH_API_MODELS[0]);
  const [llmMode, setLlmMode] = useState<LLMMode>(LLM_MODES.API);
  const [llmModel, setLlmModel] = useState<LLMModel>(LLM_API_MODELS[0]);
  const [saving, setSaving] = useState(false);

  const isAuthorized = Boolean(config?.auth.accessToken);

  useEffect(() => {
    if (config) {
      setOpenaiKey(config.apiKeys.openai ?? '');
      setGoogleKey(config.apiKeys.google ?? '');
      setSpeechMode(config.speech.mode);
      setSpeechModel(config.speech.model);
      setLlmMode(config.llm.mode);
      setLlmModel(config.llm.model);
    }
  }, [config]);

  const speechModelOptions = useMemo<SpeechModel[]>(() => {
    const base = speechMode === SPEECH_MODES.API ? SPEECH_API_MODELS : SPEECH_LOCAL_MODELS;
    return [...base] as SpeechModel[];
  }, [speechMode]);

  const llmModelOptions = useMemo<LLMModel[]>(() => {
    const base = llmMode === LLM_MODES.API ? LLM_API_MODELS : LLM_LOCAL_MODELS;
    return [...base] as LLMModel[];
  }, [llmMode]);

  useEffect(() => {
    if (!speechModelOptions.includes(speechModel)) {
      setSpeechModel(speechModelOptions[0] as SpeechModel);
    }
  }, [speechModelOptions, speechModel]);

  useEffect(() => {
    if (!llmModelOptions.includes(llmModel)) {
      setLlmModel(llmModelOptions[0] as LLMModel);
    }
  }, [llmModelOptions, llmModel]);

  const formatLabel = (value: string) =>
    value
      .replace(/[:]/g, ' ')
      .replace(/-/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateConfig({
        apiKeys: {
          openai: openaiKey.trim(),
          google: googleKey.trim()
        },
        speech: {
          mode: speechMode,
          model: speechModel
        },
        llm: {
          mode: llmMode,
          model: llmModel
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
        <p className="text-sm text-text-secondary">Авторизуйтесь, чтобы изменить настройки.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-8 px-8 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-text-primary">Настройки</h1>
        <p className="text-sm text-text-secondary">Управляйте подключением к внешним сервисам.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-2xl border border-primary-200 bg-white shadow-primary-sm p-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">Режимы и модели</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="speech-mode">Транскрибация</label>
              <select
                id="speech-mode"
                value={speechMode}
                onChange={(event) => setSpeechMode(event.target.value as SpeechMode)}
                className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              >
                <option value={SPEECH_MODES.API}>API</option>
                <option value={SPEECH_MODES.LOCAL}>Local</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="speech-model">Модель транскрибации</label>
              <select
                id="speech-model"
                value={speechModel}
                onChange={(event) => setSpeechModel(event.target.value as SpeechModel)}
                className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              >
                {speechModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {formatLabel(model)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="llm-mode">LLM процессинг</label>
              <select
                id="llm-mode"
                value={llmMode}
                onChange={(event) => setLlmMode(event.target.value as LLMMode)}
                className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              >
                <option value={LLM_MODES.API}>API</option>
                <option value={LLM_MODES.LOCAL}>Local</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="llm-model">Модель LLM</label>
              <select
                id="llm-model"
                value={llmModel}
                onChange={(event) => setLlmModel(event.target.value as LLMModel)}
                className="select-animated rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              >
                {llmModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {formatLabel(model)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">API ключи</h2>
          <p className="text-sm text-text-secondary">
            Эти ключи используются для распознавания речи (Google) и работы с LLM (OpenAI). Оставьте поле пустым, если
            планируете работать в локальном режиме.
          </p>

          <label className="flex flex-col gap-2 text-sm text-text-primary" htmlFor="google-key">
            Google AI Key
            <input
              id="google-key"
              type="text"
              value={googleKey}
              onChange={(event) => setGoogleKey(event.target.value)}
              className="input-animated rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              placeholder="AIza..."
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-text-primary" htmlFor="openai-key">
            OpenAI API Key
            <input
              id="openai-key"
              type="text"
              value={openaiKey}
              onChange={(event) => setOpenaiKey(event.target.value)}
              className="input-animated rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              placeholder="sk-..."
            />
          </label>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="button-primary rounded-lg px-6 py-2.5 text-sm font-semibold shadow-primary-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
