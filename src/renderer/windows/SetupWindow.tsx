import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LLM_API_MODELS,
  LLM_LOCAL_MODELS,
  LLM_MODES,
  SPEECH_API_MODELS,
  SPEECH_LOCAL_MODELS,
  SPEECH_MODES
} from '@shared/constants';
import type { LLMModel, SpeechModel } from '@shared/types';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import TitleBar from '../components/TitleBar';

const SetupWindow: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [speechMode, setSpeechMode] = useState(config?.speech.mode ?? SPEECH_MODES.API);
  const [speechModel, setSpeechModel] = useState<SpeechModel>(
    (config?.speech.model as SpeechModel) ??
      (config?.speech.mode === SPEECH_MODES.LOCAL ? (SPEECH_LOCAL_MODELS[0] as SpeechModel) : (SPEECH_API_MODELS[0] as SpeechModel))
  );
  const [llmMode, setLlmMode] = useState(config?.llm.mode ?? LLM_MODES.API);
  const [llmModel, setLlmModel] = useState<LLMModel>(
    (config?.llm.model as LLMModel) ??
      (config?.llm.mode === LLM_MODES.LOCAL ? (LLM_LOCAL_MODELS[0] as LLMModel) : (LLM_API_MODELS[0] as LLMModel))
  );
  const [openaiKey, setOpenaiKey] = useState(config?.apiKeys.openai ?? '');
  const [googleKey, setGoogleKey] = useState(config?.apiKeys.google ?? '');
  const [saving, setSaving] = useState(false);

  const requiresOpenAIKey = useMemo(() => llmMode === LLM_MODES.API, [llmMode]);
  const requiresGoogleKey = useMemo(() => speechMode === SPEECH_MODES.API, [speechMode]);

  const speechModelOptions = useMemo<SpeechModel[]>(
    () => [...(speechMode === SPEECH_MODES.API ? SPEECH_API_MODELS : SPEECH_LOCAL_MODELS)] as SpeechModel[],
    [speechMode]
  );

  const llmModelOptions = useMemo<LLMModel[]>(
    () => [...(llmMode === LLM_MODES.API ? LLM_API_MODELS : LLM_LOCAL_MODELS)] as LLMModel[],
    [llmMode]
  );

  useEffect(() => {
    if (!speechModelOptions.includes(speechModel)) {
      setSpeechModel(speechModelOptions[0]);
    }
  }, [speechModelOptions, speechModel]);

  useEffect(() => {
    if (!llmModelOptions.includes(llmModel)) {
      setLlmModel(llmModelOptions[0]);
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

    if (requiresOpenAIKey && requiresGoogleKey) {
      if (!openaiKey && !googleKey) {
        showToast('Please provide at least one API key (OpenAI or Google).', 'error');
        return;
      }
    } else if (requiresOpenAIKey && !openaiKey) {
      showToast('Please provide an OpenAI API Key or switch to local mode.', 'error');
      return;
    } else if (requiresGoogleKey && !googleKey) {
      showToast('Please provide a Google API Key or switch to local mode.', 'error');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateConfig({
        setupCompleted: true,
        speech: { mode: speechMode, model: speechModel },
        llm: { mode: llmMode, model: llmModel },
        apiKeys: { openai: openaiKey, google: googleKey }
      });
      showToast('Settings saved successfully', 'success');
      if (updated.actions.length === 0) {
        await window.winky?.actions.fetch().catch(() => null);
      }
      navigate('/main');
    } catch (error) {
      console.error(error);
      showToast('Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex flex-1 items-center justify-center bg-bg-base text-text-primary">
          <div className="animate-pulse-soft">Configuration not loaded.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 px-6 py-10">
          <div>
            <h2 className="text-3xl font-semibold text-text-primary">Initial Setup</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Configure your speech recognition and LLM processing modes, then provide API keys if needed.
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Speech Recognition Mode */}
            <section className="rounded-lg border border-primary-200 bg-white shadow-primary-sm p-5">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Speech Recognition Mode</h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 text-sm text-text-primary cursor-pointer">
                  <input
                    type="radio"
                    name="speechMode"
                    value={SPEECH_MODES.API}
                    checked={speechMode === SPEECH_MODES.API}
                    onChange={() => setSpeechMode(SPEECH_MODES.API)}
                    className="text-primary focus:ring-primary-light"
                    tabIndex={-1}
                  />
                  Use API Server
                </label>
                <label className="flex items-center gap-3 text-sm text-text-primary cursor-pointer">
                  <input
                    type="radio"
                    name="speechMode"
                    value={SPEECH_MODES.LOCAL}
                    checked={speechMode === SPEECH_MODES.LOCAL}
                    onChange={() => setSpeechMode(SPEECH_MODES.LOCAL)}
                    className="text-primary focus:ring-primary-light"
                    tabIndex={-1}
                  />
                  Run Locally
                </label>
              </div>
            </section>

            {/* LLM Processing Mode */}
            <section className="rounded-lg border border-primary-200 bg-white shadow-primary-sm p-5">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">LLM Processing Mode</h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 text-sm text-text-primary cursor-pointer">
                  <input
                    type="radio"
                    name="llmMode"
                    value={LLM_MODES.API}
                    checked={llmMode === LLM_MODES.API}
                    onChange={() => setLlmMode(LLM_MODES.API)}
                    className="text-primary focus:ring-primary-light"
                    tabIndex={-1}
                  />
                  Use API Server
                </label>
                <label className="flex items-center gap-3 text-sm text-text-primary cursor-pointer">
                  <input
                    type="radio"
                    name="llmMode"
                    value={LLM_MODES.LOCAL}
                    checked={llmMode === LLM_MODES.LOCAL}
                    onChange={() => setLlmMode(LLM_MODES.LOCAL)}
                    className="text-primary focus:ring-primary-light"
                    tabIndex={-1}
                  />
                  Run Locally
                </label>
              </div>
            </section>

            {/* Model Selection */}
            <section className="rounded-lg border border-primary-200 bg-white shadow-primary-sm p-5">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">Model Selection</h3>
              <div className="flex flex-col gap-5">
                <div>
                  <label className="flex flex-col gap-2 text-sm text-text-primary">
                    Speech Recognition Model
                    <select
                      value={speechModel}
                      onChange={(event) => setSpeechModel(event.target.value as SpeechModel)}
                      className="select-animated rounded-md border border-primary-200 bg-white px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
                    >
                      {speechModelOptions.map((model) => (
                        <option key={model} value={model}>
                          {formatLabel(model)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <label className="flex flex-col gap-2 text-sm text-text-primary">
                    LLM Processing Model
                    <select
                      value={llmModel}
                      onChange={(event) => setLlmModel(event.target.value as LLMModel)}
                      className="select-animated rounded-md border border-primary-200 bg-white px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
                    >
                      {llmModelOptions.map((model) => (
                        <option key={model} value={model}>
                          {formatLabel(model)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </section>

            {/* API Keys */}
            {(requiresOpenAIKey || requiresGoogleKey) && (
              <section className="rounded-lg border border-primary-200 bg-white shadow-primary-sm p-5">
                <h3 className="mb-4 text-lg font-semibold text-text-primary">API Keys</h3>
                <div className="flex flex-col gap-5">
                  {requiresGoogleKey && (
                    <div>
                      <label className="flex flex-col gap-2 text-sm text-text-primary">
                        Google API Key
                        <input
                          type="password"
                          value={googleKey}
                          onChange={(event) => setGoogleKey(event.target.value)}
                          placeholder="Enter your Google API key"
                          className="input-animated rounded-md border border-primary-200 bg-white px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
                        />
                        <span className="text-xs text-text-tertiary">
                          Required for API-based speech recognition. Leave empty if using local mode.
                        </span>
                      </label>
                    </div>
                  )}
                  {requiresOpenAIKey && (
                    <div>
                      <label className="flex flex-col gap-2 text-sm text-text-primary">
                        OpenAI API Key
                        <input
                          type="password"
                          value={openaiKey}
                          onChange={(event) => setOpenaiKey(event.target.value)}
                          placeholder="Enter your OpenAI API key"
                          className="input-animated rounded-md border border-primary-200 bg-white px-3 py-2 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light/30"
                        />
                        <span className="text-xs text-text-tertiary">
                          Required for API-based LLM processing. Leave empty if using local mode.
                        </span>
                      </label>
                    </div>
                  )}
                  {requiresOpenAIKey && requiresGoogleKey && (
                    <p className="text-xs text-text-tertiary -mt-2">
                      Note: You can provide either key if you're using local mode for one of the services.
                    </p>
                  )}
                </div>
              </section>
            )}

            <button
              type="submit"
              disabled={saving}
              className="button-primary self-end rounded-lg px-8 py-3 text-base font-semibold shadow-primary-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Complete Setup'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SetupWindow;
